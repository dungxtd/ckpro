//! Everything the app keeps between runs, in one SQLite database
//! (`ckdry.db` in the data directory): the running attempt, the candidate's
//! progress through it, exam history and UI settings. Rust owns it; the UI
//! reads and writes through commands.

use crate::runtime::preflight::Footprint;
use crate::error::{AppError, AppResult};
use rusqlite::{Connection, OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

/// Schema versions, applied in order (`PRAGMA user_version` is how many ran)
const MIGRATIONS: &[&str] = &["
    -- The attempt in progress, so it survives quitting the app (one at most)
    CREATE TABLE attempt (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state TEXT NOT NULL
    );
    -- Where the candidate is in an attempt, what they flagged, hints opened
    CREATE TABLE progress (
        attempt_id TEXT PRIMARY KEY,
        current INTEGER NOT NULL,
        flagged TEXT NOT NULL,
        hints_shown TEXT NOT NULL
    );
    CREATE TABLE history (
        attempt_id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        finished_at REAL NOT NULL,
        entry TEXT NOT NULL
    );
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
", "
    -- The practice coach's conversation, per attempt and question
    CREATE TABLE coach_message (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (attempt_id, question_id, seq)
    );
", "
    -- A coach session's own name, when the candidate renamed it
    CREATE TABLE coach_session (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        title TEXT NOT NULL,
        PRIMARY KEY (attempt_id, question_id)
    );
", "
    -- Questions where the assistant ran commands (Agent): their score was helped
    CREATE TABLE assisted (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        PRIMARY KEY (attempt_id, question_id)
    );
"];

/// Where the candidate is in an attempt
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Progress {
    pub current: u32,
    pub flagged: Vec<String>,
    /// Hints opened per question (practice mode)
    pub hints_shown: BTreeMap<String, u32>,
}

/// The exam desk's display settings
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Settings {
    /// How much larger the desktop is drawn (the ExamUI's +/-)
    pub desktop_zoom: f64,
    /// A fixed desktop resolution, or none to fit the panel
    pub desktop_resolution: Option<(u32, u32)>,
    /// Question text size: 0 (smaller) to 3 (larger), 1 by default
    pub question_size: u8,
    /// The task panel's share of the desk, in percent (its drag handle)
    pub task_width: f64,
    /// The assistant pane: shown, and its width in px (its drag handle)
    pub assistant_open: bool,
    pub assistant_width: u32,
    /// The assistant's model and effort, as last picked
    pub assistant_model: Option<String>,
    pub assistant_effort: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            desktop_zoom: 1.0,
            desktop_resolution: None,
            question_size: 1,
            task_width: 34.0,
            assistant_open: false,
            assistant_width: 380,
            assistant_model: None,
            assistant_effort: None,
        }
    }
}

/// Who said it, in a coach conversation
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct CoachMessage {
    pub role: Role,
    pub text: String,
}

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| AppError::io("creating the data directory", e))?;
        }
        Self::with(Connection::open(path).map_err(db)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> AppResult<Self> {
        Self::with(Connection::open_in_memory().map_err(db)?)
    }

    fn with(conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "journal_mode", "WAL").map_err(db)?;
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(db)?;
        for (i, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            conn.execute_batch(migration).map_err(db)?;
            conn.pragma_update(None, "user_version", i as i64 + 1).map_err(db)?;
        }
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn attempt<T: DeserializeOwned>(&self) -> AppResult<Option<T>> {
        let json: Option<String> =
            self.conn().query_row("SELECT state FROM attempt WHERE id = 1", [], |r| r.get(0)).optional().map_err(db)?;
        Ok(json.and_then(|json| serde_json::from_str(&json).ok()))
    }

    /// Keep the running attempt, or forget it (`None`)
    pub fn save_attempt<T: Serialize>(&self, attempt: Option<&T>) -> AppResult<()> {
        match attempt {
            Some(attempt) => self
                .conn()
                .execute("INSERT OR REPLACE INTO attempt (id, state) VALUES (1, ?1)", params![to_json(attempt)?])
                .map_err(db)?,
            None => self.conn().execute("DELETE FROM attempt", []).map_err(db)?,
        };
        Ok(())
    }

    pub fn progress(&self, attempt_id: &str) -> AppResult<Progress> {
        let row = self
            .conn()
            .query_row(
                "SELECT current, flagged, hints_shown FROM progress WHERE attempt_id = ?1",
                params![attempt_id],
                |r| Ok((r.get::<_, u32>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
            )
            .optional()
            .map_err(db)?;
        Ok(row
            .map(|(current, flagged, hints)| Progress {
                current,
                flagged: serde_json::from_str(&flagged).unwrap_or_default(),
                hints_shown: serde_json::from_str(&hints).unwrap_or_default(),
            })
            .unwrap_or_default())
    }

    /// Progress through `attempt_id`; older attempts' is dropped
    pub fn save_progress(&self, attempt_id: &str, progress: &Progress) -> AppResult<()> {
        let conn = self.conn();
        conn.execute("DELETE FROM progress WHERE attempt_id != ?1", params![attempt_id]).map_err(db)?;
        conn.execute(
            "INSERT OR REPLACE INTO progress (attempt_id, current, flagged, hints_shown) VALUES (?1, ?2, ?3, ?4)",
            params![attempt_id, progress.current, to_json(&progress.flagged)?, to_json(&progress.hints_shown)?],
        )
        .map_err(db)?;
        Ok(())
    }

    pub fn add_history<T: Serialize>(&self, attempt_id: &str, exam_id: &str, finished_at: f64, entry: &T) -> AppResult<()> {
        self.conn()
            .execute(
                "INSERT OR REPLACE INTO history (attempt_id, exam_id, finished_at, entry) VALUES (?1, ?2, ?3, ?4)",
                params![attempt_id, exam_id, finished_at, to_json(entry)?],
            )
            .map_err(db)?;
        Ok(())
    }

    /// Newest first; entries that no longer parse are skipped
    pub fn history<T: DeserializeOwned>(&self) -> AppResult<Vec<T>> {
        let conn = self.conn();
        let mut query = conn.prepare("SELECT entry FROM history ORDER BY finished_at DESC").map_err(db)?;
        let rows = query.query_map([], |r| r.get::<_, String>(0)).map_err(db)?;
        Ok(rows.flatten().filter_map(|json| serde_json::from_str(&json).ok()).collect())
    }

    /// A question's coach conversation in the attempt, oldest first
    pub fn coach_messages(&self, attempt_id: &str, question_id: &str) -> AppResult<Vec<CoachMessage>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare("SELECT role, text FROM coach_message WHERE attempt_id = ?1 AND question_id = ?2 ORDER BY seq")
            .map_err(db)?;
        let rows = stmt
            .query_map(params![attempt_id, question_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(db)?;
        let mut messages = Vec::new();
        for row in rows {
            let (role, text) = row.map_err(db)?;
            let role = if role == "user" { Role::User } else { Role::Assistant };
            messages.push(CoachMessage { role, text });
        }
        Ok(messages)
    }

    /// Append to a question's coach conversation (a question and its answer together)
    pub fn add_coach_messages(&self, attempt_id: &str, question_id: &str, messages: &[CoachMessage]) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db)?;
        let next: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM coach_message WHERE attempt_id = ?1 AND question_id = ?2",
                params![attempt_id, question_id],
                |r| r.get(0),
            )
            .map_err(db)?;
        for (i, m) in messages.iter().enumerate() {
            let role = match m.role {
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            tx.execute(
                "INSERT INTO coach_message (attempt_id, question_id, seq, role, text) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![attempt_id, question_id, next + i as i64, role, m.text],
            )
            .map_err(db)?;
        }
        tx.commit().map_err(db)
    }

    /// The attempt's coach sessions, latest first: question, title (its own
    /// name, else its first question), messages
    pub fn coach_sessions(&self, attempt_id: &str) -> AppResult<Vec<(String, String, u32)>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT question_id,
                        COALESCE(
                            (SELECT title FROM coach_session s WHERE s.attempt_id = m.attempt_id AND s.question_id = m.question_id),
                            (SELECT text FROM coach_message f WHERE f.attempt_id = m.attempt_id AND f.question_id = m.question_id ORDER BY seq LIMIT 1)),
                        COUNT(*)
                 FROM coach_message m WHERE attempt_id = ?1 GROUP BY question_id ORDER BY MAX(seq) DESC",
            )
            .map_err(db)?;
        let rows = stmt
            .query_map(params![attempt_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, u32>(2)?)))
            .map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)
    }

    /// The assistant ran commands for this question (Agent)
    pub fn mark_assisted(&self, attempt_id: &str, question_id: &str) -> AppResult<()> {
        self.conn()
            .execute("INSERT OR IGNORE INTO assisted (attempt_id, question_id) VALUES (?1, ?2)", params![attempt_id, question_id])
            .map(|_| ())
            .map_err(db)
    }

    /// The attempt's questions the assistant ran commands for
    pub fn assisted(&self, attempt_id: &str) -> AppResult<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT question_id FROM assisted WHERE attempt_id = ?1").map_err(db)?;
        let rows = stmt.query_map(params![attempt_id], |r| r.get(0)).map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)
    }

    /// A coach session's own name, if the candidate gave it one
    pub fn coach_session_title(&self, attempt_id: &str, question_id: &str) -> AppResult<Option<String>> {
        self.conn()
            .query_row(
                "SELECT title FROM coach_session WHERE attempt_id = ?1 AND question_id = ?2",
                params![attempt_id, question_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(db)
    }

    /// Name a coach session; an empty name goes back to its first question
    pub fn rename_coach_session(&self, attempt_id: &str, question_id: &str, title: &str) -> AppResult<()> {
        let conn = self.conn();
        let title = title.trim();
        if title.is_empty() {
            conn.execute("DELETE FROM coach_session WHERE attempt_id = ?1 AND question_id = ?2", params![attempt_id, question_id])
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO coach_session (attempt_id, question_id, title) VALUES (?1, ?2, ?3)",
                params![attempt_id, question_id, title],
            )
        }
        .map(|_| ())
        .map_err(db)
    }

    /// Start a question's session over (its name goes with it)
    pub fn clear_coach_messages(&self, attempt_id: &str, question_id: &str) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db)?;
        for table in ["coach_message", "coach_session"] {
            tx.execute(&format!("DELETE FROM {table} WHERE attempt_id = ?1 AND question_id = ?2"), params![attempt_id, question_id])
                .map_err(db)?;
        }
        tx.commit().map_err(db)
    }

    pub fn settings(&self) -> AppResult<Settings> {
        self.setting("exam_desk")
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        self.save_setting("exam_desk", settings)
    }

    /// Where the assistant's runtime is, as set in Settings
    pub fn assistant_runtime(&self) -> AppResult<crate::ai::agent::RuntimePaths> {
        self.setting("assistant_runtime")
    }

    pub fn save_assistant_runtime(&self, paths: &crate::ai::agent::RuntimePaths) -> AppResult<()> {
        self.save_setting("assistant_runtime", paths)
    }

    /// What the exam nodes were measured to take on this machine
    pub fn footprint(&self) -> AppResult<Footprint> {
        self.setting("footprint")
    }

    pub fn save_footprint(&self, footprint: &Footprint) -> AppResult<()> {
        self.save_setting("footprint", footprint)
    }

    /// A value kept as JSON under `key`; its default when unset or unreadable
    fn setting<T: DeserializeOwned + Default>(&self, key: &str) -> AppResult<T> {
        let json: Option<String> = self
            .conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .map_err(db)?;
        Ok(json.and_then(|json| serde_json::from_str(&json).ok()).unwrap_or_default())
    }

    fn save_setting<T: Serialize>(&self, key: &str, value: &T) -> AppResult<()> {
        self.conn()
            .execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", params![key, to_json(value)?])
            .map_err(db)?;
        Ok(())
    }

    /// Move what earlier versions kept in files (`attempt.json`, `history/`)
    /// into the database, once.
    pub fn import_files(&self, data_dir: &Path) {
        let attempt = data_dir.join("attempt.json");
        if let Some(state) = std::fs::read(&attempt).ok().and_then(|j| serde_json::from_slice::<serde_json::Value>(&j).ok())
            && self.save_attempt(Some(&state)).is_ok()
        {
            let _ = std::fs::remove_file(&attempt);
        }
        let history = data_dir.join("history");
        for file in std::fs::read_dir(&history).into_iter().flatten().flatten() {
            let Some(entry) = std::fs::read(file.path()).ok().and_then(|j| serde_json::from_slice::<serde_json::Value>(&j).ok())
            else {
                continue;
            };
            let id = entry["attempt_id"].as_str().unwrap_or_default().to_string();
            let exam = entry["exam_id"].as_str().unwrap_or_default().to_string();
            let finished = entry["result"]["finished_at"].as_f64().unwrap_or_default();
            if !id.is_empty() && self.add_history(&id, &exam, finished, &entry).is_ok() {
                let _ = std::fs::remove_file(file.path());
            }
        }
        let _ = std::fs::remove_dir(&history);
    }
}

fn db(e: rusqlite::Error) -> AppError {
    AppError::io("the app database", std::io::Error::other(e))
}

fn to_json<T: Serialize + ?Sized>(value: &T) -> AppResult<String> {
    serde_json::to_string(value).map_err(|e| AppError::io("the app database", std::io::Error::other(e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_attempt_progress_history_and_settings() {
        let store = Store::in_memory().unwrap();
        assert_eq!(store.attempt::<serde_json::Value>().unwrap(), None);
        store.save_attempt(Some(&serde_json::json!({ "phase": "running" }))).unwrap();
        assert_eq!(store.attempt::<serde_json::Value>().unwrap(), Some(serde_json::json!({ "phase": "running" })));
        store.save_attempt::<()>(None).unwrap();
        assert_eq!(store.attempt::<serde_json::Value>().unwrap(), None);

        let progress = Progress { current: 3, flagged: vec!["q1".into()], hints_shown: BTreeMap::from([("q2".into(), 1)]) };
        store.save_progress("old", &Progress::default()).unwrap();
        store.save_progress("a1", &progress).unwrap();
        assert_eq!(store.progress("a1").unwrap(), progress);
        assert_eq!(store.progress("old").unwrap(), Progress::default());

        store.add_history("a1", "e", 1.0, &"first").unwrap();
        store.add_history("a2", "e", 2.0, &"second").unwrap();
        assert_eq!(store.history::<String>().unwrap(), ["second", "first"]);

        assert_eq!(store.settings().unwrap(), Settings::default());
        let settings = Settings {
            desktop_zoom: 1.5,
            desktop_resolution: Some((1920, 1080)),
            question_size: 2,
            task_width: 41.5,
            assistant_open: true,
            assistant_width: 460,
            assistant_model: Some("opus".into()),
            assistant_effort: Some("high".into()),
        };
        store.save_settings(&settings).unwrap();
        assert_eq!(store.settings().unwrap(), settings);
        // Settings saved by an earlier version: the new ones take their defaults
        store.save_setting("exam_desk", &serde_json::json!({ "desktop_zoom": 2.0, "question_size": 3 })).unwrap();
        let old = store.settings().unwrap();
        assert_eq!((old.desktop_zoom, old.question_size, old.task_width, old.assistant_width), (2.0, 3, 34.0, 380));
    }

    #[test]
    fn keeps_coach_conversations_per_attempt_and_question() {
        let store = Store::in_memory().unwrap();
        let say = |role, text: &str| CoachMessage { role, text: text.into() };
        store.add_coach_messages("a1", "q1", &[say(Role::User, "hint?"), say(Role::Assistant, "look at PVCs")]).unwrap();
        store.add_coach_messages("a1", "q1", &[say(Role::User, "why?"), say(Role::Assistant, "wrong class")]).unwrap();
        store.add_coach_messages("a1", "q2", &[say(Role::User, "other")]).unwrap();
        let q1 = store.coach_messages("a1", "q1").unwrap();
        assert_eq!(q1.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(), ["hint?", "look at PVCs", "why?", "wrong class"]);
        assert_eq!(q1[1].role, Role::Assistant);
        assert!(store.coach_messages("a2", "q1").unwrap().is_empty());
        let sessions = store.coach_sessions("a1").unwrap();
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().any(|(q, title, n)| q == "q1" && title == "hint?" && *n == 4));
        // Renamed: its own name; an empty one goes back to the first question
        store.rename_coach_session("a1", "q1", "  PVC binding ").unwrap();
        assert_eq!(store.coach_session_title("a1", "q1").unwrap().as_deref(), Some("PVC binding"));
        assert!(store.coach_sessions("a1").unwrap().iter().any(|(q, title, _)| q == "q1" && title == "PVC binding"));
        store.rename_coach_session("a1", "q1", "").unwrap();
        assert!(store.coach_sessions("a1").unwrap().iter().any(|(q, title, _)| q == "q1" && title == "hint?"));
        store.clear_coach_messages("a1", "q1").unwrap();
        assert!(store.coach_messages("a1", "q1").unwrap().is_empty() && store.coach_messages("a1", "q2").unwrap().len() == 1);
    }

    #[test]
    fn imports_the_files_earlier_versions_wrote() {
        let dir = std::env::temp_dir().join(format!("ckdry-store-import-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("history")).unwrap();
        std::fs::write(dir.join("attempt.json"), r#"{"state":{"phase":"running"},"questions":[]}"#).unwrap();
        std::fs::write(
            dir.join("history/1.json"),
            r#"{"attempt_id":"1","exam_id":"core/x","result":{"finished_at":5.0}}"#,
        )
        .unwrap();
        let store = Store::in_memory().unwrap();
        store.import_files(&dir);
        assert!(store.attempt::<serde_json::Value>().unwrap().is_some());
        assert_eq!(store.history::<serde_json::Value>().unwrap().len(), 1);
        assert!(!dir.join("attempt.json").exists() && !dir.join("history").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
