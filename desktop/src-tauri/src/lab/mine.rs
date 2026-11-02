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

/// Delete the candidate's exam `mine/<certification>` and the questions it
/// lists (all of that certification's). Any other id is refused: nothing
/// outside the candidate's pack is ever touched
pub fn delete_exam(data_dir: &Path, exam_id: &str) -> AppResult<()> {
    let certification = exam_id
        .strip_prefix(&format!("{PACK_ID}/"))
        .filter(|c| !c.is_empty() && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-'))
        .ok_or_else(|| AppError::invalid("only your own exams can be deleted"))?;
    let root = root(data_dir);
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
}
