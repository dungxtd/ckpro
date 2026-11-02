//! The candidate's own questions ("My questions"): a pack in the data
//! directory (`packs/mine`) that the coach's generator adds to, merged with the
//! bundled pack. Each certification with questions gets an exam of them all.

use super::load::{self, LoadedPack};
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};

pub const PACK_ID: &str = "mine";

pub fn root(data_dir: &Path) -> PathBuf {
    data_dir.join("packs").join(PACK_ID)
}

/// The bundled pack with the candidate's questions and exams added (their
/// certifications are the bundled pack's). Problems in their files are
/// logged, not fatal.
pub fn merged(mut core: LoadedPack, data_dir: &Path) -> LoadedPack {
    let (mine, findings) = load::load(&root(data_dir));
    for f in &findings {
        tracing::warn!(file = %f.file, "my questions: {}", f.message);
    }
    if let Some(mine) = mine {
        core.questions.extend(mine.questions);
        core.exams.extend(mine.exams);
    }
    core
}

/// Where a new question about `certification` goes: a file name from its
/// title, never one already used. Returns (id, path).
pub fn new_question(data_dir: &Path, certification: &str, title: &str) -> (String, PathBuf) {
    let dir = root(data_dir).join("questions").join(certification);
    let base: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(48)
        .collect();
    let base = if base.is_empty() { "question".to_string() } else { base };
    let mut slug = base.clone();
    let mut n = 2;
    while dir.join(format!("{slug}.yaml")).exists() {
        slug = format!("{base}-{n}");
        n += 1;
    }
    (format!("{PACK_ID}/{certification}/{slug}"), dir.join(format!("{slug}.yaml")))
}

/// Keep a verified question, and list it in its certification's exam of
/// the candidate's questions. Returns that exam's id.
pub fn save(data_dir: &Path, certification: &str, certification_title: &str, path: &Path, yaml: &str) -> AppResult<String> {
    let root = root(data_dir);
    let io = |e: std::io::Error| AppError::io("saving the question", e);
    std::fs::create_dir_all(path.parent().unwrap_or(&root)).map_err(io)?;
    let pack_file = root.join("pack.yaml");
    if !pack_file.exists() {
        std::fs::write(&pack_file, "# The questions the coach generated and cktry verified\nid: mine\ntitle: My questions\nversion: 0.1.0\n")
            .map_err(io)?;
    }
    std::fs::write(path, yaml).map_err(io)?;

    // The exam lists every question of the certification, oldest first
    let dir = root.join("questions").join(certification);
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .map_err(io)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "yaml"))
        .collect();
    files.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    let ids: Vec<String> = files
        .iter()
        .filter_map(|p| p.file_stem().map(|s| format!("  - {PACK_ID}/{certification}/{}", s.to_string_lossy())))
        .collect();
    let exam = format!(
        "title: My questions · {}\ndescription: Questions the coach generated for {certification_title}, each proven on a cluster\ncertification: {certification}\nquestions:\n{}\n",
        certification.to_uppercase(),
        ids.join("\n")
    );
    let exams = root.join("exams");
    std::fs::create_dir_all(&exams).map_err(io)?;
    std::fs::write(exams.join(format!("{certification}.yaml")), exam).map_err(io)?;
    Ok(format!("{PACK_ID}/{certification}"))
}

/// Where the exams built in Create with Claude go: `mine/custom/<slug>`
const CUSTOM: &str = "custom";

/// Keep an exam built in Create with Claude: its `questions` (ids of any
/// pack, in order) and length. Returns its id
pub fn save_exam(data_dir: &Path, title: &str, certification: &str, duration_minutes: Option<u32>, questions: &[String]) -> AppResult<String> {
    let dir = root(data_dir).join("exams").join(CUSTOM);
    let io = |e: std::io::Error| AppError::io("saving the exam", e);
    std::fs::create_dir_all(&dir).map_err(io)?;
    let pack_file = root(data_dir).join("pack.yaml");
    if !pack_file.exists() {
        std::fs::write(&pack_file, "# The questions the coach generated and cktry verified\nid: mine\ntitle: My questions\nversion: 0.1.0\n")
            .map_err(io)?;
    }
    let base = slug(title);
    let mut name = base.clone();
    let mut n = 2;
    while dir.join(format!("{name}.yaml")).exists() {
        name = format!("{base}-{n}");
        n += 1;
    }
    let mut yaml = format!(
        "title: {}\ndescription: Built with Claude in Create\ncertification: {certification}\n",
        serde_json::to_string(title.trim()).unwrap_or_default()
    );
    if let Some(minutes) = duration_minutes {
        yaml.push_str(&format!("duration: {minutes}m\n"));
    }
    yaml.push_str("questions:\n");
    for id in questions {
        yaml.push_str(&format!("  - {id}\n"));
    }
    std::fs::write(dir.join(format!("{name}.yaml")), yaml).map_err(io)?;
    Ok(format!("{PACK_ID}/{CUSTOM}/{name}"))
}

/// A file name from a title
fn slug(title: &str) -> String {
    let words: Vec<String> = title
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(String::from)
        .collect();
    let slug: String = words.join("-").chars().take(48).collect();
    if slug.is_empty() { "exam".into() } else { slug.trim_end_matches('-').to_string() }
}

/// Delete one of the candidate's exams. `mine/custom/<slug>` (built in
/// Create) goes alone; `mine/<certification>` takes the questions it lists
/// (all of that certification's) and the custom exams that used them. Any
/// other id is refused: nothing outside the candidate's pack is ever touched
pub fn delete_exam(data_dir: &Path, exam_id: &str) -> AppResult<()> {
    let name_ok = |c: &&str| !c.is_empty() && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-');
    if let Some(name) = exam_id.strip_prefix(&format!("{PACK_ID}/{CUSTOM}/")).filter(name_ok) {
        let exam = root(data_dir).join("exams").join(CUSTOM).join(format!("{name}.yaml"));
        if !exam.exists() {
            return Err(AppError::not_found(format!("no exam '{exam_id}'")));
        }
        return std::fs::remove_file(&exam).map_err(|e| AppError::io("deleting the exam", e));
    }
    let certification = exam_id
        .strip_prefix(&format!("{PACK_ID}/"))
        .filter(name_ok)
        .ok_or_else(|| AppError::invalid("only your own exams can be deleted"))?;
    let root = root(data_dir);
    // Custom exams using these questions would no longer load
    let prefix = format!("  - {PACK_ID}/{certification}/");
    for custom in std::fs::read_dir(root.join("exams").join(CUSTOM)).into_iter().flatten().flatten() {
        if std::fs::read_to_string(custom.path()).is_ok_and(|text| text.lines().any(|l| l.starts_with(&prefix))) {
            let _ = std::fs::remove_file(custom.path());
        }
    }
    let exam = root.join("exams").join(format!("{certification}.yaml"));
    if !exam.exists() {
        return Err(AppError::not_found(format!("no exam '{exam_id}'")));
    }
    let io = |e: std::io::Error| AppError::io("deleting the exam", e);
    std::fs::remove_file(&exam).map_err(io)?;
    let questions = root.join("questions").join(certification);
    if questions.exists() {
        std::fs::remove_dir_all(&questions).map_err(io)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_questions_with_an_exam_per_certification() {
        let data = std::env::temp_dir().join(format!("cktry-mine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        let (id, path) = new_question(&data, "cka", "Fix a Pending PVC!");
        assert_eq!(id, "mine/cka/fix-a-pending-pvc");
        let exam = save(&data, "cka", "Certified Kubernetes Administrator", &path, "title: x\n").unwrap();
        assert_eq!(exam, "mine/cka");
        // A second one with the same title gets its own file
        let (id2, path2) = new_question(&data, "cka", "Fix a Pending PVC!");
        assert_eq!(id2, "mine/cka/fix-a-pending-pvc-2");
        save(&data, "cka", "Certified Kubernetes Administrator", &path2, "title: y\n").unwrap();
        let exam_file = std::fs::read_to_string(root(&data).join("exams/cka.yaml")).unwrap();
        assert!(exam_file.contains("  - mine/cka/fix-a-pending-pvc\n  - mine/cka/fix-a-pending-pvc-2"), "{exam_file}");
        assert!(root(&data).join("pack.yaml").exists());
        let _ = std::fs::remove_dir_all(&data);
    }

    #[test]
    fn deletes_only_the_candidates_own_exam() {
        let data = std::env::temp_dir().join(format!("cktry-mine-delete-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&data);
        let (_, path) = new_question(&data, "ckad", "Probe a pod");
        save(&data, "ckad", "Certified Kubernetes Application Developer", &path, "title: x\n").unwrap();
        for wrong in ["cka-001", "mine/", "mine/../exams", "mine/ckad/x", "mine/cks"] {
            assert!(delete_exam(&data, wrong).is_err(), "{wrong}");
        }
        assert!(path.exists());
        delete_exam(&data, "mine/ckad").unwrap();
        assert!(!root(&data).join("exams/ckad.yaml").exists());
        assert!(!root(&data).join("questions/ckad").exists());
        let _ = std::fs::remove_dir_all(&data);
    }

    /// A custom exam lists questions of any pack and its length; deleting it
    /// leaves them. Deleting My questions takes the custom exams using them
    #[test]
    fn custom_exams_are_kept_and_deleted() {
        let dir = std::env::temp_dir().join(format!("cktry-mine-custom-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (mine_id, path) = new_question(&dir, "cka", "Back up etcd");
        save(&dir, "cka", "CKA", &path, "title: Back up etcd\n").unwrap();
        let first = save_exam(&dir, "Weak spots: etcd!", "cka", Some(90), &["core/cka-001/q01".into(), mine_id.clone()]).unwrap();
        assert_eq!(first, "mine/custom/weak-spots-etcd");
        let text = std::fs::read_to_string(root(&dir).join("exams/custom/weak-spots-etcd.yaml")).unwrap();
        assert!(text.contains("duration: 90m") && text.contains(&format!("  - {mine_id}")), "{text}");
        assert_eq!(save_exam(&dir, "Weak spots: etcd!", "cka", None, &[]).unwrap(), "mine/custom/weak-spots-etcd-2");

        delete_exam(&dir, "mine/custom/weak-spots-etcd-2").unwrap();
        assert!(path.exists(), "a custom exam's questions stay");
        delete_exam(&dir, "mine/cka").unwrap();
        assert!(!root(&dir).join("exams/custom/weak-spots-etcd.yaml").exists(), "it used the deleted questions");
        assert!(delete_exam(&dir, "mine/custom/../../x").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

}
