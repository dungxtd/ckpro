//! Reads a pack directory into typed values. Every file is parsed even when
//! others fail, so one run reports every problem with its file.

use super::model::{Exam, Pack, Question};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub struct Loaded<T> {
    pub path: PathBuf,
    pub value: T,
}

pub struct LoadedPack {
    pub root: PathBuf,
    pub pack: Pack,
    /// Keyed by id: `<pack>/<path under questions/ without .yaml>`
    pub questions: BTreeMap<String, Loaded<Question>>,
    /// Keyed by id: `<pack>/<path under exams/ without .yaml>`
    pub exams: BTreeMap<String, Loaded<Exam>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Level {
    Error,
    Warning,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
pub struct Finding {
    pub level: Level,
    /// File the finding is about, relative to the pack root
    pub file: String,
    pub message: String,
}

pub fn load(root: &Path) -> (Option<LoadedPack>, Vec<Finding>) {
    let mut findings = Vec::new();
    let error = |findings: &mut Vec<Finding>, path: &Path, message: String| {
        findings.push(Finding { level: Level::Error, file: relative(root, path), message })
    };

    let pack_file = root.join("pack.yaml");
    let pack: Pack = match parse(&pack_file) {
        Ok(pack) => pack,
        Err(message) => {
            error(&mut findings, &pack_file, message);
            return (None, findings);
        }
    };

    let mut questions = BTreeMap::new();
    for path in yaml_files(&root.join("questions")) {
        match parse::<Question>(&path) {
            Ok(mut value) => {
                // Changing the nodes, by its word or its scripts: one flag to read
                value.disrupts = value.changes_the_nodes();
                questions.insert(id(&pack.id, &root.join("questions"), &path), Loaded { path, value });
            }
            Err(message) => error(&mut findings, &path, message),
        }
    }
    let mut exams = BTreeMap::new();
    for path in yaml_files(&root.join("exams")) {
        match parse::<Exam>(&path) {
            Ok(value) => {
                exams.insert(id(&pack.id, &root.join("exams"), &path), Loaded { path, value });
            }
            Err(message) => error(&mut findings, &path, message),
        }
    }
    (Some(LoadedPack { root: root.to_path_buf(), pack, questions, exams }), findings)
}

pub fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).display().to_string()
}

fn parse<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("cannot read: {e}"))?;
    serde_saphyr::from_str(&text).map_err(|e| e.to_string())
}

/// `questions/cka/rbac.yaml` → `<pack>/cka/rbac`
fn id(pack: &str, base: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(base).unwrap_or(path).with_extension("");
    let rel = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
    format!("{pack}/{rel}")
}

fn yaml_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else { return files };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            files.extend(yaml_files(&path));
        } else if path.extension().is_some_and(|e| e == "yaml" || e == "yml") {
            files.push(path);
        }
    }
    files.sort();
    files
}
