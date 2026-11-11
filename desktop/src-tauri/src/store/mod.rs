//! Everything the app keeps between runs, in one SQLite database
//! (`ckpro.db` in the data directory): the running attempt, the candidate's
//! progress through it, exam history and UI settings. Rust owns it; the UI
//! reads and writes through commands.

use crate::sync::MutexExt;
use crate::error::{AppError, AppResult};
use rusqlite::{Connection, OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Mutex;

mod coach;
mod plans;
mod settings;
mod studio;

pub use coach::CoachMessage;
pub use plans::StoredPlan;
pub use settings::Settings;
pub use studio::{StudioMessage, StudioSessionRow, ToolUse};

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
", "
    -- Several coach sessions per question: a new one keeps the earlier ones.
    -- What was kept is the first session (0) of its question
    CREATE TABLE coach_message_v5 (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        session INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (attempt_id, question_id, session, seq)
    );
    INSERT INTO coach_message_v5 SELECT attempt_id, question_id, 0, seq, role, text FROM coach_message ORDER BY rowid;
    DROP TABLE coach_message;
    ALTER TABLE coach_message_v5 RENAME TO coach_message;
    -- Each session, made when it starts; its own name when renamed
    CREATE TABLE coach_session_v5 (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        session INTEGER NOT NULL,
        title TEXT,
        PRIMARY KEY (attempt_id, question_id, session)
    );
    INSERT INTO coach_session_v5 SELECT attempt_id, question_id, 0, title FROM coach_session;
    DROP TABLE coach_session;
    ALTER TABLE coach_session_v5 RENAME TO coach_session;
    -- The session a question's pane shows (else its latest)
    CREATE TABLE coach_current (
        attempt_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        session INTEGER NOT NULL,
        PRIMARY KEY (attempt_id, question_id)
    );
", "
    -- Study plans written by the coach are no longer kept
    DELETE FROM coach_message WHERE attempt_id = 'study-plan';
    DELETE FROM coach_session WHERE attempt_id = 'study-plan';
    DELETE FROM coach_current WHERE attempt_id = 'study-plan';
", "
    -- Exams the candidate plans to take on a day (YYYY-MM-DD, their own time)
    CREATE TABLE plan (
        id INTEGER PRIMARY KEY,
        day TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX plan_day ON plan (day);
", "
    -- Create with Claude: a conversation building an exam, and its draft (JSON)
    CREATE TABLE studio_session (
        id INTEGER PRIMARY KEY,
        title TEXT,
        updated_at INTEGER NOT NULL,
        draft TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE studio_message (
        session INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        PRIMARY KEY (session, seq)
    );
", "
    -- The tools Claude used for an answer in Create, in order (JSON)
    ALTER TABLE studio_message ADD COLUMN tools TEXT NOT NULL DEFAULT '[]';
"];

/// Where the candidate is in an attempt
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct Progress {
    pub current: u32,
    pub flagged: Vec<String>,
    /// Hints opened per question (practice mode)
    pub hints_shown: BTreeMap<String, u32>,
}

/// Who said it, in a coach conversation
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
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

    fn with(mut conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "journal_mode", "WAL").map_err(db)?;
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(db)?;
        // Each migration with its version, or neither: a crash between the two
        // would run it again on a schema that already has it
        for (i, migration) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            let tx = conn.transaction().map_err(db)?;
            tx.execute_batch(migration).map_err(db)?;
            tx.pragma_update(None, "user_version", i as i64 + 1).map_err(db)?;
            tx.commit().map_err(db)?;
        }
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.locked()
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
    use super::settings::{ExamSort, ExamTarget, HomeLayout, ModulePlace, SidebarLayout, Theme};
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
            assistant_enabled: false,
            analytics: false,
            sidebar_folded: true,
            sidebar: SidebarLayout {
                groups: vec!["cks".into(), "cka".into()],
                exams: vec!["cka-002".into()],
                collapsed: vec!["ckad".into()],
                hidden: vec![],
                screens: vec!["/calendar".into()],
                hidden_screens: vec!["/environment".into()],
                pinned: vec!["cka-003".into()],
                sort: [("ckad".to_string(), ExamSort::Score)].into(),
            },
            theme: Theme::System,
            targets: vec![
                ExamTarget { certification: "cka".into(), date: "2026-12-15".into(), started: "2026-10-06".into(), rest_days: vec![4] },
                ExamTarget { certification: "ckad".into(), date: "2027-03-20".into(), started: "2026-11-02".into(), rest_days: vec![] },
            ],
            target: None,
            focus: Some("ckad".into()),
            home: HomeLayout { places: vec![ModulePlace { module: "today".into(), x: 2, y: 1 }], hidden: vec!["recent".into()], custom: true },
        };
        store.save_settings(&settings).unwrap();
        // Saved with `target` as the first exam, for an older ckpro
        assert_eq!(store.settings().unwrap(), Settings { target: Some(settings.targets[0].clone()), ..settings.clone() });
        // Settings from before several exams: the one target becomes the list
        store.save_setting("exam_desk", &serde_json::json!({ "target": { "certification": "cks", "date": "2027-06-30", "started": "2027-01-01" } })).unwrap();
        let before = store.settings().unwrap();
        assert_eq!(before.targets.len(), 1);
        assert_eq!(before.targets[0].certification, "cks");
        assert!(before.home.places.is_empty() && !before.home.custom && before.focus.is_none());
        // Settings saved by an earlier version: the new ones take their defaults
        store.save_setting("exam_desk", &serde_json::json!({ "desktop_zoom": 2.0, "question_size": 3 })).unwrap();
        let old = store.settings().unwrap();
        assert_eq!((old.desktop_zoom, old.question_size, old.task_width, old.assistant_width), (2.0, 3, 34.0, 380));
        assert!(old.assistant_enabled);
    }

    #[test]
    fn imports_the_files_earlier_versions_wrote() {
        let dir = std::env::temp_dir().join(format!("ckpro-store-import-{}", std::process::id()));
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
