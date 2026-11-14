//! The exam a Create conversation builds: questions of the packs, and new
//! ones Claude proposes. A new question is checked as it comes (format,
//! certification, the verify cluster's shape, no twin of a question already
//! there, lint); proving the whole exam on a cluster (its questions together,
//! as in an exam) and saving are the candidate's. A question added or
//! changed is to be proven; the others keep what they proved. One question
//! at most changes the nodes for the rest (`disrupts`), and it runs last.

use super::proof::{CLUSTER, MAX_WORKERS};
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
    /// The certification's domains and their weight in the real exam
    /// (percent), heaviest first: what the exam's coverage is measured against
    #[serde(default)]
    pub domains: Vec<DomainWeight>,
    /// The exam it was saved as
    #[serde(default)]
    pub saved: Option<String>,
    /// What the candidate changed themselves since the assistant last
    /// answered, told to it with their next message (it sees the draft only
    /// when it asks for it)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub changes: Vec<String>,
    /// Its questions as they are were all proven in one run (Prove all):
    /// not once one comes, goes or changes, though each stays proven
    #[serde(default)]
    pub together: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DomainWeight {
    pub domain: String,
    pub weight: u32,
}

/// An exam's length the candidate or Claude may set, in minutes
pub const LENGTH: std::ops::RangeInclusive<u32> = 10..=300;

/// A question's content, to see that its file changed: a stable hash (FNV-1a)
/// of it as read, the same from one run to the next
pub fn version(q: &Question) -> String {
    let text = serde_json::to_string(q).unwrap_or_default();
    let hash = text.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3));
    format!("{hash:016x}")
}

/// A question's suggested time, in whole minutes
pub fn minutes(q: &Question) -> Option<u32> {
    q.estimate.as_ref()?.seconds().map(|s| s.div_ceil(60) as u32)
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
        /// Its suggested time, in minutes
        #[serde(default)]
        minutes: Option<u32>,
        /// Where it stands in this exam (proven alone in its pack, not with these)
        #[serde(default)]
        status: DraftStatus,
        /// It changes the nodes for the questions after it
        #[serde(default)]
        disrupts: bool,
        /// Its content when it was added or last proven (`version`): a file
        /// changed since is proven again
        #[serde(default, skip_serializing_if = "String::is_empty")]
        version: String,
        /// The YAML this draft wrote it from, when it was a new question
        /// saved with the exam: if its file goes (the candidate's questions
        /// deleted), the draft has it back as a new question
        #[serde(default, skip_serializing_if = "Option::is_none")]
        written: Option<String>,
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
    /// Its suggested time, in minutes
    #[serde(default)]
    pub minutes: Option<u32>,
    pub status: DraftStatus,
    /// It changes the nodes for the questions after it
    #[serde(default)]
    pub disrupts: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DraftStatus {
    /// To be proven with the exam on a cluster (a new one lints)
    #[default]
    Linted,
    /// In the exam's run, every check failed before its solution and passed after
    Proven,
    /// It did not prove, and why
    Failed { problems: Vec<String> },
}

impl DraftItem {
    /// Its name in the draft: a pack question's id, a new one's key
    pub fn key(&self) -> &str {
        match self {
            DraftItem::Existing { id, .. } => id,
            DraftItem::New(q) => &q.key,
        }
    }

    /// Its title (a pack question's id if it had none)
    pub fn title(&self) -> &str {
        match self {
            DraftItem::Existing { id, title, .. } => if title.is_empty() { id } else { title },
            DraftItem::New(q) => &q.title,
        }
    }

    pub fn status(&self) -> &DraftStatus {
        match self {
            DraftItem::Existing { status, .. } => status,
            DraftItem::New(q) => &q.status,
        }
    }

    fn status_mut(&mut self) -> &mut DraftStatus {
        match self {
            DraftItem::Existing { status, .. } => status,
            DraftItem::New(q) => &mut q.status,
        }
    }

    /// It changes the nodes for the questions after it
    pub fn disrupts(&self) -> bool {
        match self {
            DraftItem::Existing { disrupts, .. } => *disrupts,
            DraftItem::New(q) => q.disrupts,
        }
    }

    /// What it is, where it stands aside: the same question if equal
    pub fn content(&self) -> (&str, &str) {
        match self {
            DraftItem::Existing { id, .. } => (id, ""),
            DraftItem::New(q) => (&q.key, &q.yaml),
        }
    }
}

impl ExamDraft {
    /// A conversation's draft (an empty one before its first). One that
    /// cannot be read is an error, never taken for empty: it would be saved
    /// over
    pub fn load(store: &Store, session: i32) -> AppResult<Self> {
        Self::parse(&store.studio_draft(session)?)
    }

    fn parse(text: &str) -> AppResult<Self> {
        serde_json::from_str(text).map_err(|e| AppError::invalid(format!("this conversation's exam could not be read: {e}")))
    }

    /// Change a conversation's draft with `f`: Claude's tools, the screen
    /// and a proof never write over each other (`f` runs again on the draft
    /// as it is when another change came between). The draft as kept, and
    /// what `f` returns
    pub fn update<T>(store: &Store, session: i32, f: impl FnMut(&mut ExamDraft) -> AppResult<T>) -> AppResult<(ExamDraft, T)> {
        Self::update_unless(store, session, || Ok(()), f)
    }

    /// `update`, refused by `writable` up to the moment it is written
    pub fn update_unless<T>(
        store: &Store,
        session: i32,
        writable: impl Fn() -> AppResult<()>,
        mut f: impl FnMut(&mut ExamDraft) -> AppResult<T>,
    ) -> AppResult<(ExamDraft, T)> {
        store.studio_update_draft(session, writable, |text| {
            let mut draft = Self::parse(text)?;
            let out = f(&mut draft)?;
            let text = serde_json::to_string(&draft).map_err(|e| AppError::internal("keeping the draft", e))?;
            Ok((text, (draft, out)))
        })
    }

    /// Keep it as the conversation's draft, whatever was there (tests)
    #[cfg(test)]
    pub fn save(&self, store: &Store, session: i32) -> AppResult<()> {
        Self::update(store, session, |draft| {
            *draft = self.clone();
            Ok(())
        })
        .map(|_| ())
    }

    pub fn new_questions(&self) -> impl Iterator<Item = &NewQuestion> {
        self.items.iter().filter_map(|i| match i {
            DraftItem::New(q) => Some(q),
            DraftItem::Existing { .. } => None,
        })
    }

    /// The id or key a question has in the draft, and where it stands
    pub fn statuses(&self) -> impl Iterator<Item = (&str, &DraftStatus)> {
        self.items.iter().map(|i| (i.key(), i.status()))
    }

    pub fn status_mut(&mut self, key: &str) -> Option<&mut DraftStatus> {
        self.items.iter_mut().find(|i| i.key() == key).map(DraftItem::status_mut)
    }

    /// A question's title, by its id or key
    pub fn title_of(&self, key: &str) -> Option<&str> {
        self.items.iter().find(|i| i.key() == key).map(DraftItem::title)
    }

    /// Questions of the packs it lists that are gone (deleted since): their
    /// ids and titles
    pub fn missing(&self, bank: &LoadedPack) -> Vec<(String, String)> {
        self.items
            .iter()
            .filter(|i| matches!(i, DraftItem::Existing { .. }) && !bank.questions.contains_key(i.key()))
            .map(|i| (i.key().to_string(), i.title().to_string()))
            .collect()
    }

    /// None of its questions is gone: else, which, to take out
    pub fn complete(&self, bank: &LoadedPack) -> AppResult<()> {
        match self.missing(bank).as_slice() {
            [] => Ok(()),
            [(_, title)] => Err(AppError::invalid(format!("{title} was deleted: remove it from the exam"))),
            gone => Err(AppError::invalid(format!("{} questions were deleted: remove them from the exam", gone.len()))),
        }
    }

    /// Every question proven together: it can be saved
    pub fn proven(&self) -> bool {
        !self.items.is_empty() && self.items.iter().all(|i| *i.status() == DraftStatus::Proven)
    }

    /// The questions that change the nodes for the rest, by title, but the
    /// one `except` (a key being replaced)
    fn disruptive(&self, except: Option<&str>) -> impl Iterator<Item = &str> {
        self.items.iter().filter(move |i| i.disrupts() && Some(i.key()) != except).map(DraftItem::title)
    }

    /// One question at most changes the nodes: else, why it cannot be proven
    pub fn disrupting(&self) -> AppResult<()> {
        let titles: Vec<&str> = self.disruptive(None).collect();
        match titles.as_slice() {
            [first, second, ..] => Err(AppError::invalid(format!("{first} and {second} both change the nodes for what follows: keep one"))),
            _ => Ok(()),
        }
    }

    /// Add a question: last, but before the one that changes the nodes
    fn place(&mut self, item: DraftItem) {
        if !item.disrupts() && self.items.last().is_some_and(DraftItem::disrupts) {
            self.items.insert(self.items.len() - 1, item);
        } else {
            self.items.push(item);
        }
    }

    /// Every question to be proven again (the candidate's "prove all")
    pub fn unprove(&mut self) {
        for item in &mut self.items {
            *item.status_mut() = DraftStatus::Linted;
        }
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
        // Left out, the length stays as it is (the candidate's own, perhaps)
        if let Some(m) = duration_minutes {
            self.duration_minutes = Some(m.clamp(*LENGTH.start(), *LENGTH.end()));
        }
        let mut domains: Vec<DomainWeight> = bank.pack.certifications[certification]
            .domains
            .iter()
            .map(|(domain, weight)| DomainWeight { domain: domain.clone(), weight: *weight })
            .collect();
        domains.sort_by_key(|d| std::cmp::Reverse(d.weight));
        self.domains = domains;
        Ok(())
    }

    /// The candidate's changes: a new title, another length, or every
    /// question out
    pub fn edit(&mut self, title: Option<&str>, duration_minutes: Option<u32>, clear: bool) {
        if let Some(title) = title.map(str::trim).filter(|t| !t.is_empty() && *t != self.title) {
            self.changes.push(format!("renamed the exam \"{title}\""));
            self.title = title.to_string();
        }
        if let Some(minutes) = duration_minutes.map(|m| m.clamp(*LENGTH.start(), *LENGTH.end()))
            && self.duration_minutes != Some(minutes)
        {
            self.changes.push(match self.duration_minutes {
                Some(was) => format!("set its length to {minutes} minutes (it was {was})"),
                None => format!("set its length to {minutes} minutes"),
            });
            self.duration_minutes = Some(minutes);
        }
        if clear && !self.items.is_empty() {
            self.changes.push("took every question out".into());
            self.items.clear();
        }
    }

    /// The questions it wrote whose files are gone (`exists` says which are
    /// still there): new questions again, to be proven and saved anew
    pub fn rewrite_gone(&mut self, exists: impl Fn(&str) -> bool) -> bool {
        let mut any = false;
        let mut keys = self.new_questions().filter_map(|q| q.key.strip_prefix('n')?.parse::<u32>().ok()).max().unwrap_or(0);
        for item in &mut self.items {
            if let DraftItem::Existing { id, title, domain, minutes, disrupts, written: Some(yaml), .. } = item
                && !exists(id)
            {
                keys += 1;
                *item = DraftItem::New(NewQuestion {
                    key: format!("n{keys}"),
                    title: title.clone(),
                    domain: domain.clone(),
                    yaml: yaml.clone(),
                    minutes: *minutes,
                    status: DraftStatus::Linted,
                    disrupts: *disrupts,
                });
                any = true;
            }
        }
        any
    }

    /// The packs' questions as they are now: one whose file changed since it
    /// was added (its title, time, or whether it changes the nodes) is taken
    /// as it is and proven again. Whether any changed
    pub fn refresh(&mut self, bank: &LoadedPack) -> bool {
        let mut changed = false;
        let mut moved = Vec::new();
        for item in &mut self.items {
            let DraftItem::Existing { id, title, minutes: m, status, disrupts, version: was, .. } = item else { continue };
            let Some(q) = bank.questions.get(id.as_str()) else { continue };
            let now = version(&q.value);
            // Added before versions were kept: as it is now, nothing to redo
            if was.is_empty() {
                *was = now;
                continue;
            }
            if *was != now {
                let flips = *disrupts != q.value.disrupts;
                (*title, *m, *disrupts, *was) = (q.value.title.clone(), minutes(&q.value), q.value.disrupts, now);
                *status = DraftStatus::Linted;
                changed = true;
                if flips {
                    moved.push(id.clone());
                }
            }
        }
        // One that now changes the nodes goes last (or no longer, back among the rest)
        for id in moved {
            if let Some(at) = self.items.iter().position(|i| i.key() == id) {
                let item = self.items.remove(at);
                self.place(item);
            }
        }
        changed
    }

    /// The candidate took a question out themselves; whether it was there
    pub fn remove_by_candidate(&mut self, id_or_key: &str) -> bool {
        let title = self.items.iter().find(|i| i.key() == id_or_key).map(|i| i.title().to_string());
        let removed = self.remove(id_or_key);
        if let Some(title) = title.filter(|_| removed) {
            self.changes.push(format!("took \"{title}\" out"));
        }
        removed
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
                refused.push(format!("{id}: needs what ckpro does not provide"));
            } else if q.value.cluster != CLUSTER {
                refused.push(format!("{id}: runs on another cluster than `{CLUSTER}`"));
            } else if self.items.iter().any(|i| i.key() == id) {
                // There already
            } else if let Some(other) = self.disruptive(None).next().filter(|_| q.value.disrupts) {
                refused.push(format!("{id}: changes the nodes for what follows, and {other} does already: an exam has one at most"));
            } else {
                let domain = q.value.certifications[&self.certification].clone();
                self.place(DraftItem::Existing {
                    id: id.clone(),
                    title: q.value.title.clone(),
                    domain,
                    minutes: minutes(&q.value),
                    status: DraftStatus::Linted,
                    disrupts: q.value.disrupts,
                    version: version(&q.value),
                    written: None,
                });
            }
        }
        refused
    }

    /// Add a new question, or replace `replacing` (a key) with it, once it
    /// passes the checks; its key, or everything wrong with it
    pub fn propose(&mut self, bank: &LoadedPack, data_dir: &Path, yaml: &str, replacing: Option<&str>) -> Result<String, Vec<String>> {
        if let Some(key) = replacing
            && self.find_new(key).is_none()
        {
            return Err(vec![format!("no new question '{key}' in the draft")]);
        }
        let question = self.check(bank, data_dir, yaml, replacing)?;
        let domain = question.certifications[&self.certification].clone();
        let key = replacing.map_or_else(|| self.next_key(), str::to_string);
        let new = NewQuestion {
            key: key.clone(),
            minutes: minutes(&question),
            title: question.title,
            domain,
            yaml: yaml.trim().to_string() + "\n",
            status: DraftStatus::Linted,
            disrupts: question.disrupts,
        };
        match self.find_new(&key) {
            // In its place, unless it now changes the nodes (or no longer
            // does): then where `place` puts it, last or before the last
            Some(existing) if existing.disrupts == new.disrupts => *existing = new,
            Some(_) => {
                self.remove(&key);
                self.place(DraftItem::New(new));
            }
            None => self.place(DraftItem::New(new)),
        }
        Ok(key)
    }

    /// Remove a question by id or key; whether there was one
    pub fn remove(&mut self, id_or_key: &str) -> bool {
        let before = self.items.len();
        self.items.retain(|i| i.key() != id_or_key);
        self.items.len() != before
    }

    fn check(&self, bank: &LoadedPack, data_dir: &Path, yaml: &str, replacing: Option<&str>) -> Result<Question, Vec<String>> {
        if self.certification.is_empty() {
            return Err(vec!["set the exam first (set_exam): its certification".into()]);
        }
        let mut question: Question = serde_saphyr::from_str(yaml).map_err(|e| vec![format!("not valid question YAML: {e}")])?;
        // Known from its scripts, whatever it says
        question.disrupts = question.changes_the_nodes();
        let mut problems = Vec::new();
        let Some(certification) = bank.pack.certifications.get(&self.certification) else {
            return Err(vec![format!("the exam's certification '{}' is not in the packs any more", self.certification)]);
        };
        let domains = &certification.domains;
        match question.certifications.get(&self.certification) {
            Some(domain) if domains.contains_key(domain) => {}
            Some(domain) => problems.push(format!(
                "'{domain}' is not a {} domain; one of {}",
                self.certification,
                domains.keys().cloned().collect::<Vec<_>>().join(", ")
            )),
            None => problems.push(format!("`certifications` must map `{}` to one of its domains", self.certification)),
        }
        if question.cluster != CLUSTER {
            problems.push(format!("use the `{CLUSTER}` cluster (leave `cluster` out)"));
        }
        if question.workers > MAX_WORKERS {
            problems.push(format!("at most {MAX_WORKERS} worker nodes"));
        }
        if let Some(other) = self.disruptive(replacing).next().filter(|_| question.disrupts) {
            problems.push(format!("it changes the nodes for what follows, and {other} does already: an exam has one at most"));
        }
        problems.extend(super::rules::problems(&question));
        let title = question.title.trim().to_lowercase();
        if let Some((id, _)) = bank.questions.iter().find(|(_, q)| q.value.title.trim().to_lowercase() == title) {
            problems.push(format!("a question with this title is there already: {id}; write another task"));
        }
        if self.new_questions().any(|q| Some(q.key.as_str()) != replacing && q.title.trim().to_lowercase() == title) {
            problems.push("the draft has a question with this title already".into());
        }
        if problems.is_empty() {
            let (id, path) = mine::new_question(data_dir, &self.certification, &question.title);
            let staging = crate::lab::mine::staging(bank, data_dir, [(id, path.clone(), question.clone())]);
            problems.extend(crate::lab::lint::errors_in(&staging, &path));
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
        let dir = std::env::temp_dir().join(format!("ckpro-draft-{}", std::process::id()));
        let mut draft = ExamDraft::default();
        assert!(draft.propose(&bank, &dir, &question("A web deployment", ""), None).is_err(), "no exam yet");

        draft.set_exam(&bank, "Mock", "cka", Some(90)).unwrap();
        assert!(draft.set_exam(&bank, "Mock", "lfcs", None).is_err());
        let key = draft.propose(&bank, &dir, &question("A web deployment", ""), None).unwrap();
        assert_eq!(key, "n1");
        assert_eq!(draft.new_questions().next().unwrap().status, DraftStatus::Linted);

        let problems = draft.propose(&bank, &dir, &question("A web deployment", ""), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("draft has a question with this title")), "{problems:?}");
        let problems = draft.propose(&bank, &dir, &question("Four workers", "workers: 4\n"), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("at most 3 worker")), "{problems:?}");
        let taken = bank.questions.values().find(|q| q.value.certifications.contains_key("cka")).unwrap().value.title.clone();
        let problems = draft.propose(&bank, &dir, &question(&taken, ""), None).unwrap_err();
        assert!(problems.iter().any(|p| p.contains("is there already")), "{problems:?}");

        // Fixing n1 keeps its key, even with its own title
        assert_eq!(draft.propose(&bank, &dir, &question("A web deployment", ""), Some("n1")).unwrap(), "n1");
        assert_eq!(draft.new_questions().count(), 1);
        assert!(draft.remove("n1"));
        assert!(draft.items.is_empty());
    }

    /// A question of the packs changed on disk since it was added is taken
    /// as it is now, to prove again; one as it was stays proven
    #[test]
    fn a_question_changed_on_disk_is_proven_again() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", None).unwrap();
        let mut ids = bank.questions.iter().filter(|(_, q)| q.value.certifications.contains_key("cka") && q.value.runnable() && !q.value.disrupts).map(|(id, _)| id.clone());
        let (same, changed) = (ids.next().unwrap(), ids.next().unwrap());
        draft.add_existing(&bank, &[same.clone(), changed.clone()]);
        assert!(!draft.refresh(&bank), "as they were added");
        for item in &mut draft.items {
            if let DraftItem::Existing { id, title, status, version, .. } = item {
                *status = DraftStatus::Proven;
                if *id == changed {
                    // Read before its file changed (its checks, say: the title alike)
                    *title = "As it was".into();
                    *version = "0000000000000000".into();
                }
            }
        }
        assert!(draft.refresh(&bank));
        let status = |id: &str| draft.items.iter().find(|i| i.key() == id).map(|i| match i {
            DraftItem::Existing { status, title, .. } => (status.clone(), title.clone()),
            DraftItem::New(_) => unreachable!(),
        });
        assert_eq!(status(&same).unwrap().0, DraftStatus::Proven);
        let (status, title) = status(&changed).unwrap();
        assert_eq!(status, DraftStatus::Linted);
        assert_eq!(title, bank.questions[changed.as_str()].value.title);
        assert!(!draft.refresh(&bank), "once is enough");
    }

    /// What the candidate changes themselves is kept for the assistant (it
    /// does not see the draft unless it asks); a change to the same is none
    #[test]
    fn the_candidates_changes_are_kept_for_the_assistant() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", Some(90)).unwrap();
        let cka = bank.questions.iter().find(|(_, q)| q.value.certifications.contains_key("cka") && q.value.runnable()).unwrap().0.clone();
        draft.add_existing(&bank, std::slice::from_ref(&cka));
        draft.edit(Some("Mock"), Some(90), false);
        assert!(draft.changes.is_empty(), "nothing changed");
        draft.edit(Some("Warm-up"), Some(60), false);
        assert!(draft.remove_by_candidate(&cka));
        assert_eq!(draft.changes.len(), 3, "{:?}", draft.changes);
        assert!(draft.changes[1].contains("60 minutes (it was 90)"));
        assert!(draft.changes[2].starts_with("took \""));
    }

    /// A question fixed into one that changes the nodes moves last, where
    /// the rest cannot be broken by it; the length the candidate set stays
    /// when the exam is set again without one
    #[test]
    fn a_fix_that_changes_the_nodes_moves_last() {
        let bank = bank();
        let dir = std::env::temp_dir().join(format!("ckpro-draft-last-{}", std::process::id()));
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", Some(90)).unwrap();
        draft.edit(None, Some(60), false);
        draft.set_exam(&bank, "Mock again", "cka", None).unwrap();
        assert_eq!(draft.duration_minutes, Some(60), "kept");

        let first = draft.propose(&bank, &dir, &question("A first deployment", ""), None).unwrap();
        draft.propose(&bank, &dir, &question("A second deployment", ""), None).unwrap();
        draft.propose(&bank, &dir, &question("A first deployment", "disrupts: true\n"), Some(&first)).unwrap();
        assert_eq!(draft.items.last().map(DraftItem::key), Some(first.as_str()));
        assert!(draft.items.last().is_some_and(DraftItem::disrupts));
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

    /// A question added or changed is to be proven, the others keep what
    /// they proved; the candidate can have them all proven again
    #[test]
    fn a_change_is_proven_and_the_rest_kept() {
        let bank = bank();
        let dir = std::env::temp_dir().join(format!("ckpro-draft-changed-{}", std::process::id()));
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", None).unwrap();
        let mut cka = bank.questions.iter().filter(|(_, q)| q.value.certifications.contains_key("cka") && q.value.runnable() && !q.value.disrupts).map(|(id, _)| id.clone());
        let (a, b) = (cka.next().unwrap(), cka.next().unwrap());
        draft.add_existing(&bank, std::slice::from_ref(&a));
        let prove = |draft: &mut ExamDraft| {
            let ids: Vec<String> = draft.statuses().map(|(id, _)| id.to_string()).collect();
            for id in ids {
                *draft.status_mut(&id).unwrap() = DraftStatus::Proven;
            }
        };
        prove(&mut draft);
        assert!(draft.proven());
        draft.add_existing(&bank, std::slice::from_ref(&b));
        let unproven: Vec<&str> = draft.statuses().filter(|(_, s)| **s != DraftStatus::Proven).map(|(id, _)| id).collect();
        assert_eq!(unproven, [b.as_str()]);
        prove(&mut draft);
        let key = draft.propose(&bank, &dir, &question("A web deployment", ""), None).unwrap();
        assert_eq!(draft.statuses().filter(|(_, s)| **s != DraftStatus::Proven).map(|(id, _)| id).collect::<Vec<_>>(), [key.as_str()]);
        assert!(draft.remove(&key));
        assert!(draft.proven(), "what is left proved");
        draft.unprove();
        assert!(draft.statuses().all(|(_, s)| *s == DraftStatus::Linted));
    }

    /// A question of the packs deleted since it was added is named, and the
    /// exam cannot be proven or saved until it is taken out
    #[test]
    fn a_deleted_question_is_named_until_removed() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", None).unwrap();
        draft.items.push(DraftItem::Existing { id: "mine/cka/gone".into(), title: "Gone".into(), domain: "storage".into(), minutes: None, status: DraftStatus::Proven, disrupts: false, version: String::new(), written: None });
        assert_eq!(draft.missing(&bank), [("mine/cka/gone".to_string(), "Gone".to_string())]);
        assert!(draft.complete(&bank).unwrap_err().to_string().contains("Gone was deleted"));
        assert!(draft.remove("mine/cka/gone"));
        assert!(draft.complete(&bank).is_ok());
    }

    /// One question at most changes the nodes, and it runs last
    #[test]
    fn one_question_changes_the_nodes_and_runs_last() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", None).unwrap();
        let disrupting: Vec<String> = bank.questions.iter().filter(|(_, q)| q.value.disrupts && q.value.certifications.contains_key("cka") && q.value.runnable()).map(|(id, _)| id.clone()).collect();
        assert!(disrupting.len() >= 2, "the packs have them: {disrupting:?}");
        let calm = bank.questions.iter().find(|(_, q)| q.value.certifications.contains_key("cka") && q.value.runnable() && !q.value.disrupts).unwrap().0.clone();
        assert!(draft.add_existing(&bank, &disrupting[..1]).is_empty());
        let refused = draft.add_existing(&bank, &disrupting[1..2]);
        assert!(refused[0].contains("one at most"), "{refused:?}");
        draft.add_existing(&bank, std::slice::from_ref(&calm));
        assert!(matches!(draft.items.last(), Some(DraftItem::Existing { id, .. }) if *id == disrupting[0]), "it stays last");
        assert!(draft.disrupting().is_ok());
    }

    /// The exam keeps its certification's domain weights (heaviest first)
    /// and each question's minutes; the candidate renames it, sets its
    /// length (within reason) and empties it
    #[test]
    fn the_draft_measures_and_takes_edits() {
        let bank = bank();
        let mut draft = ExamDraft::default();
        draft.set_exam(&bank, "Mock", "cka", Some(60)).unwrap();
        assert!(!draft.domains.is_empty());
        assert!(draft.domains.windows(2).all(|w| w[0].weight >= w[1].weight));
        let (id, q) = bank.questions.iter().find(|(_, q)| q.value.certifications.contains_key("cka") && q.value.estimate.is_some() && q.value.runnable()).unwrap();
        draft.add_existing(&bank, std::slice::from_ref(id));
        assert!(matches!(&draft.items[0], DraftItem::Existing { minutes: Some(m), .. } if Some(*m) == minutes(&q.value)));

        draft.edit(Some("  Warm-up  "), Some(5), false);
        assert_eq!((draft.title.as_str(), draft.duration_minutes), ("Warm-up", Some(10)));
        draft.edit(Some(" "), None, true);
        assert_eq!(draft.title, "Warm-up");
        assert!(draft.items.is_empty());
    }

}
