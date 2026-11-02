//! The exam a Create conversation builds: questions of the packs, and new
//! ones Claude proposes. A new question is checked as it comes (format,
//! certification, the verify cluster's shape, no twin of a question already
//! there, lint); proving it on a cluster and saving are the candidate's.

use super::workspace;
use crate::ai::generate::{lint_errors, staging_of};
use crate::error::{AppError, AppResult};
use crate::lab::load::LoadedPack;
use crate::lab::mine;
use crate::lab::model::Question;
use crate::store::Store;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ExamDraft {
    #[serde(default)]
    pub title: String,
    /// A certification of the pack (`cka`); every question belongs to it
    #[serde(default)]
    pub certification: String,
    #[serde(default)]
    pub duration_minutes: Option<u32>,
    #[serde(default)]
    pub items: Vec<DraftItem>,
    /// The exam it was saved as
    #[serde(default)]
    pub saved: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DraftItem {
    /// A question of the packs, by id (its title and domain as added)
    Existing {
        id: String,
        #[serde(default)]
        title: String,
        #[serde(default)]
        domain: String,
    },
    /// A question Claude wrote for this exam
    New(NewQuestion),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct NewQuestion {
    /// Its name in the draft (`n1`, `n2`…), until it is saved
    pub key: String,
    pub title: String,
    /// Its domain in the draft's certification
    pub domain: String,
    pub yaml: String,
    pub status: DraftStatus,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DraftStatus {
    /// It lints: to be proven on a cluster
    Linted,
    /// Every check failed before its solution and passed after
    Proven,
    /// It did not prove, and why
    Failed { problems: Vec<String> },
}

impl ExamDraft {
    pub fn load(store: &Store, session: i32) -> AppResult<Self> {
        let text = store.studio_draft(session)?;
        Ok(serde_json::from_str(&text).unwrap_or_default())
    }

    pub fn save(&self, store: &Store, session: i32) -> AppResult<()> {
        let text = serde_json::to_string(self).map_err(|e| AppError::invalid(e.to_string()))?;
        store.studio_save_draft(session, &text)
    }

    pub fn new_questions(&self) -> impl Iterator<Item = &NewQuestion> {
        self.items.iter().filter_map(|i| match i {
            DraftItem::New(q) => Some(q),
            DraftItem::Existing { .. } => None,
        })
    }

    pub fn find_new(&mut self, key: &str) -> Option<&mut NewQuestion> {
        self.items.iter_mut().find_map(|i| match i {
            DraftItem::New(q) if q.key == key => Some(q),
            _ => None,
        })
    }

    fn next_key(&self) -> String {
        let n = self.new_questions().filter_map(|q| q.key.strip_prefix('n')?.parse::<u32>().ok()).max().unwrap_or(0);
        format!("n{}", n + 1)
    }

    /// Set what the exam is: a certification of `bank`
    pub fn set_exam(&mut self, bank: &LoadedPack, title: &str, certification: &str, duration_minutes: Option<u32>) -> AppResult<()> {
        if !bank.pack.certifications.contains_key(certification) {
            return Err(AppError::invalid(format!(
                "no certification '{certification}'; one of {}",
                bank.pack.certifications.keys().cloned().collect::<Vec<_>>().join(", ")
            )));
        }
        if self.certification != certification && !self.items.is_empty() {
            return Err(AppError::invalid("the draft has questions of another certification: remove them first"));
        }
        self.title = title.trim().to_string();
        self.certification = certification.to_string();
        self.duration_minutes = duration_minutes;
        Ok(())
    }

    /// Add questions of the packs; the ids not added, and why
    pub fn add_existing(&mut self, bank: &LoadedPack, ids: &[String]) -> Vec<String> {
        let mut refused = Vec::new();
        for id in ids {
            let Some(q) = bank.questions.get(id) else {
                refused.push(format!("{id}: no such question"));
                continue;
            };
            if !q.value.certifications.contains_key(&self.certification) {
                refused.push(format!("{id}: not a {} question", self.certification));
            } else if !q.value.runnable() {
                refused.push(format!("{id}: needs what cktry does not provide"));
            } else if !self.items.iter().any(|i| matches!(i, DraftItem::Existing { id: x, .. } if x == id)) {
                let domain = q.value.certifications[&self.certification].clone();
                self.items.push(DraftItem::Existing { id: id.clone(), title: q.value.title.clone(), domain });
            }
        }
        refused
    }

    /// Add a new question, or replace `replacing` (a key) with it, once it
    /// passes the checks; its key, or everything wrong with it
    pub fn propose(&mut self, bank: &LoadedPack, data_dir: &Path, yaml: &str, replacing: Option<&str>) -> Result<String, Vec<String>> {
        let question = self.check(bank, data_dir, yaml, replacing)?;
        let domain = question.certifications[&self.certification].clone();
        let key = replacing.map_or_else(|| self.next_key(), str::to_string);
        let new = NewQuestion { key: key.clone(), title: question.title, domain, yaml: yaml.trim().to_string() + "\n", status: DraftStatus::Linted };
        match self.find_new(&key) {
            Some(existing) => *existing = new,
            None => self.items.push(DraftItem::New(new)),
        }
        Ok(key)
    }

    /// Remove a question by id or key; whether there was one
    pub fn remove(&mut self, id_or_key: &str) -> bool {
        let before = self.items.len();
        self.items.retain(|i| match i {
            DraftItem::Existing { id, .. } => id != id_or_key,
            DraftItem::New(q) => q.key != id_or_key,
        });
        self.items.len() != before
    }

    fn check(&self, bank: &LoadedPack, data_dir: &Path, yaml: &str, replacing: Option<&str>) -> Result<Question, Vec<String>> {
        if self.certification.is_empty() {
            return Err(vec!["set the exam first (set_exam): its certification".into()]);
        }
        let question: Question = serde_saphyr::from_str(yaml).map_err(|e| vec![format!("not valid question YAML: {e}")])?;
        let mut problems = Vec::new();
        let domains = &bank.pack.certifications[&self.certification].domains;
        match question.certifications.get(&self.certification) {
            Some(domain) if domains.contains_key(domain) => {}
            Some(domain) => problems.push(format!(
                "'{domain}' is not a {} domain; one of {}",
                self.certification,
                domains.keys().cloned().collect::<Vec<_>>().join(", ")
            )),
            None => problems.push(format!("`certifications` must map `{}` to one of its domains", self.certification)),
        }
        if question.cluster != workspace::CLUSTER {
            problems.push(format!("use the `{}` cluster (leave `cluster` out)", workspace::CLUSTER));
        }
        if question.workers > workspace::WORKERS {
            problems.push(format!("at most {} worker node (the verify cluster's size)", workspace::WORKERS));
        }
        let title = question.title.trim().to_lowercase();
        if let Some((id, _)) = bank.questions.iter().find(|(_, q)| q.value.title.trim().to_lowercase() == title) {
            problems.push(format!("a question with this title is there already: {id}; write another task"));
        }
        if self.new_questions().any(|q| Some(q.key.as_str()) != replacing && q.title.trim().to_lowercase() == title) {
            problems.push("the draft has a question with this title already".into());
        }
        if problems.is_empty() {
            let (id, path) = mine::new_question(data_dir, &self.certification, &question.title);
            let staging = staging_of(bank, data_dir, [(id, path.clone(), question.clone())]);
            problems.extend(lint_errors(&staging, &path));
        }
        if problems.is_empty() { Ok(question) } else { Err(problems) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bank() -> LoadedPack {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        crate::lab::load::load(&root).0.expect("the core pack loads")
    }

    /// A short, valid CKA question, titled `title`
    fn question(title: &str, extra: &str) -> String {
        format!(
            "title: {title}\ncertifications:\n  cka: workloads-scheduling\nnamespace: studio-test\n{extra}\
statement: Create a deployment `web` in namespace `studio-test`.\n\
setup: kubectl create namespace studio-test --dry-run=client -o yaml | kubectl apply -f -\n\
checks:\n  - name: Deployment exists\n    weight: 1\n    run: kubectl -n studio-test get deploy web\n\
solution:\n  run: kubectl -n studio-test create deploy web --image=nginx:1.27\n  explain: Create it. See https://kubernetes.io/docs/concepts/workloads/controllers/deployment/\n\
hints:\n  - kubectl create deploy\n"
        )
    }

    /// Questions are checked as they come: an exam first, the certification
    /// and the verify cluster's shape, no twin title; a fixed one replaces
    /// its key
    #[test]
    fn proposals_are_checked_before_they_join() {
        let bank = bank();
        let dir = std::env::temp_dir().join(format!("cktry-draft-{}", std::process::id()));
        let mut draft = ExamDraft::default();
        assert!(draft.propose(&bank, &dir, &question("A web deployment", ""), None).is_err(), "no exam yet");

        draft.set_exam(&bank, "Mock", "cka", Some(90)).unwrap();
        assert!(draft.set_exam(&bank, "Mock", "lfcs", None).is_err());
        let key = draft.propose(&bank, &dir, &question("A web deployment", ""), None).unwrap();
        assert_eq!(key, "n1");
        assert_eq!(draft.new_questions().next().unwrap().status, DraftStatus::Linted);

        let problems = draft.propose(&bank, &dir, &question("A web deployment", ""), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("draft has a question with this title")), "{problems:?}");
        let problems = draft.propose(&bank, &dir, &question("Two workers", "workers: 2\n"), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("at most 1 worker")), "{problems:?}");
        let taken = bank.questions.values().find(|q| q.value.certifications.contains_key("cka")).unwrap().value.title.clone();
        let problems = draft.propose(&bank, &dir, &question(&taken, ""), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("is there already")), "{problems:?}");

        // Fixing n1 keeps its key, even with its own title
        assert_eq!(draft.propose(&bank, &dir, &question("A web deployment", ""), Some("n1")).unwrap(), "n1");
        assert_eq!(draft.new_questions().count(), 1);
        assert!(draft.remove("n1"));
        assert!(draft.items.is_empty());
    }

    #[test]
    fn existing_questions_join_once_and_of_the_exam_only() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", None).unwrap();
        let cka = bank.questions.iter().find(|(_, q)| q.value.certifications.contains_key("cka") && q.value.runnable()).unwrap().0.clone();
        let ckad = bank.questions.iter().find(|(_, q)| !q.value.certifications.contains_key("cka")).unwrap().0.clone();
        let refused = draft.add_existing(&bank, &[cka.clone(), cka.clone(), ckad.clone(), "nope".into()]);
        assert!(matches!(draft.items.as_slice(), [DraftItem::Existing { id, title, .. }] if *id == cka && !title.is_empty()));
        assert_eq!(refused.len(), 2);
    }
}
