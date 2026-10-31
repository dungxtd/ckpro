//! Everything the app keeps between runs, in one SQLite database
//! (`ckdry.db` in the data directory): the running attempt, the candidate's
//! progress through it, exam history and UI settings. Rust owns it; the UI
//! reads and writes through commands.

use crate::sync::MutexExt;
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
"];

/// A coach session read back: question, session, title, messages
pub type Transcript = (String, i64, String, Vec<CoachMessage>);

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
    /// The assistant at all: off, the app has no AI anywhere
    pub assistant_enabled: bool,
    /// Anonymous usage analytics (on unless turned off in Settings > About)
    pub analytics: bool,
    /// The sidebar folded into the floating capsule (⌃⌘S)
    pub sidebar_folded: bool,
    /// How the sidebar lists the screens and the exams
    pub sidebar: SidebarLayout,
    /// Light or dark, or as macOS is
    pub theme: Theme,
}

/// The app's appearance
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// As macOS is set, following it when it changes
    System,
    Light,
    #[default]
    Dark,
}

/// How the sidebar lists the screens and the exams: in the order the
/// candidate dragged them (what was never dragged after, as it comes), and
/// what is folded or hidden
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct SidebarLayout {
    /// Certifications, in order
    pub groups: Vec<String>,
    /// Exam ids, in order
    pub exams: Vec<String>,
    /// Certifications whose exams are folded away
    pub collapsed: Vec<String>,
    /// Certifications not in the sidebar at all
    pub hidden: Vec<String>,
    /// The screens (their paths), in order
    pub screens: Vec<String>,
    /// Screens not in the sidebar (Exams always is)
    pub hidden_screens: Vec<String>,
    /// Exams pinned to the top of the sidebar, in order
    pub pinned: Vec<String>,
    /// How each certification sorts its exams (by default: as dragged)
    pub sort: std::collections::BTreeMap<String, ExamSort>,
}

/// How a certification's exams are sorted in the sidebar
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExamSort {
    /// As dragged; the rest as they come
    #[default]
    Manual,
    /// Practised most recently first; never practised after
    Recent,
    /// By name
    Name,
    /// Lowest last score first; never practised before them
    Score,
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
            assistant_enabled: true,
            analytics: true,
            sidebar_folded: false,
            sidebar: SidebarLayout::default(),
            theme: Theme::Dark,
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

    /// The session a question's pane shows: the one picked, else the latest
    fn current_session(conn: &Connection, attempt_id: &str, question_id: &str) -> AppResult<i64> {
        conn.query_row(
            "SELECT COALESCE(
                (SELECT session FROM coach_current WHERE attempt_id = ?1 AND question_id = ?2),
                (SELECT MAX(session) FROM coach_session WHERE attempt_id = ?1 AND question_id = ?2),
                (SELECT MAX(session) FROM coach_message WHERE attempt_id = ?1 AND question_id = ?2),
                0)",
            params![attempt_id, question_id],
            |r| r.get(0),
        )
        .map_err(db)
    }

    /// A session's messages, oldest first
    fn session_messages(conn: &Connection, attempt_id: &str, question_id: &str, session: i64) -> AppResult<Vec<CoachMessage>> {
        let mut stmt = conn
            .prepare(
                "SELECT role, text FROM coach_message
                 WHERE attempt_id = ?1 AND question_id = ?2 AND session = ?3 ORDER BY seq",
            )
            .map_err(db)?;
        let rows = stmt
            .query_map(params![attempt_id, question_id, session], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(db)?;
        let mut messages = Vec::new();
        for row in rows {
            let (role, text) = row.map_err(db)?;
            let role = if role == "user" { Role::User } else { Role::Assistant };
            messages.push(CoachMessage { role, text });
        }
        Ok(messages)
    }

    /// The question's current coach session: its number and messages
    pub fn coach_messages(&self, attempt_id: &str, question_id: &str) -> AppResult<(i64, Vec<CoachMessage>)> {
        let conn = self.conn();
        let session = Self::current_session(&conn, attempt_id, question_id)?;
        Ok((session, Self::session_messages(&conn, attempt_id, question_id, session)?))
    }

    /// Append to the question's current session (a question and its answer together)
    pub fn add_coach_messages(&self, attempt_id: &str, question_id: &str, messages: &[CoachMessage]) -> AppResult<()> {
        let mut conn = self.conn();
        let session = Self::current_session(&conn, attempt_id, question_id)?;
        let tx = conn.transaction().map_err(db)?;
        let next: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(seq) + 1, 0) FROM coach_message WHERE attempt_id = ?1 AND question_id = ?2 AND session = ?3",
                params![attempt_id, question_id, session],
                |r| r.get(0),
            )
            .map_err(db)?;
        tx.execute(
            "INSERT OR IGNORE INTO coach_session (attempt_id, question_id, session, title) VALUES (?1, ?2, ?3, NULL)",
            params![attempt_id, question_id, session],
        )
        .map_err(db)?;
        for (i, m) in messages.iter().enumerate() {
            let role = match m.role {
                Role::User => "user",
                Role::Assistant => "assistant",
            };
            tx.execute(
                "INSERT INTO coach_message (attempt_id, question_id, session, seq, role, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![attempt_id, question_id, session, next + i as i64, role, m.text],
            )
            .map_err(db)?;
        }
        tx.commit().map_err(db)
    }

    /// A new session for the question, unless its current one is still
    /// empty; the earlier ones stay. Its number
    pub fn new_coach_session(&self, attempt_id: &str, question_id: &str) -> AppResult<i64> {
        let conn = self.conn();
        let current = Self::current_session(&conn, attempt_id, question_id)?;
        if Self::session_messages(&conn, attempt_id, question_id, current)?.is_empty() {
            return Ok(current);
        }
        let next: i64 = conn
            .query_row(
                "SELECT MAX(COALESCE((SELECT MAX(session) FROM coach_session WHERE attempt_id = ?1 AND question_id = ?2), 0),
                            COALESCE((SELECT MAX(session) FROM coach_message WHERE attempt_id = ?1 AND question_id = ?2), 0)) + 1",
                params![attempt_id, question_id],
                |r| r.get(0),
            )
            .map_err(db)?;
        conn.execute(
            "INSERT INTO coach_session (attempt_id, question_id, session, title) VALUES (?1, ?2, ?3, NULL)",
            params![attempt_id, question_id, next],
        )
        .map_err(db)?;
        Self::pick(&conn, attempt_id, question_id, next)?;
        Ok(next)
    }

    /// Show an earlier session of the question
    pub fn open_coach_session(&self, attempt_id: &str, question_id: &str, session: i64) -> AppResult<()> {
        Self::pick(&self.conn(), attempt_id, question_id, session)
    }

    fn pick(conn: &Connection, attempt_id: &str, question_id: &str, session: i64) -> AppResult<()> {
        conn.execute(
            "INSERT OR REPLACE INTO coach_current (attempt_id, question_id, session) VALUES (?1, ?2, ?3)",
            params![attempt_id, question_id, session],
        )
        .map(|_| ())
        .map_err(db)
    }

    /// The attempt's coach sessions that have messages, latest first:
    /// question, session, title (its own name, else its first question),
    /// messages
    pub fn coach_sessions(&self, attempt_id: &str) -> AppResult<Vec<(String, i64, String, u32)>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT question_id, session,
                        COALESCE(
                            (SELECT title FROM coach_session s
                             WHERE s.attempt_id = m.attempt_id AND s.question_id = m.question_id AND s.session = m.session),
                            (SELECT text FROM coach_message f
                             WHERE f.attempt_id = m.attempt_id AND f.question_id = m.question_id AND f.session = m.session
                             ORDER BY seq LIMIT 1)),
                        COUNT(*)
                 FROM coach_message m WHERE attempt_id = ?1
                 GROUP BY question_id, session ORDER BY MAX(rowid) DESC",
            )
            .map_err(db)?;
        let rows = stmt
            .query_map(params![attempt_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)
    }

    /// Every session of an attempt with its messages, latest first (History)
    pub fn coach_transcripts(&self, attempt_id: &str) -> AppResult<Vec<Transcript>> {
        let sessions = self.coach_sessions(attempt_id)?;
        let conn = self.conn();
        sessions
            .into_iter()
            .map(|(question, session, title, _)| {
                let messages = Self::session_messages(&conn, attempt_id, &question, session)?;
                Ok((question, session, title, messages))
            })
            .collect()
    }

    /// The attempts that have coach sessions
    pub fn coached_attempts(&self) -> AppResult<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT DISTINCT attempt_id FROM coach_message").map_err(db)?;
        let rows = stmt.query_map([], |r| r.get(0)).map_err(db)?;
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

    /// The current coach session's own name, if the candidate gave it one
    pub fn coach_session_title(&self, attempt_id: &str, question_id: &str) -> AppResult<Option<String>> {
        let conn = self.conn();
        let session = Self::current_session(&conn, attempt_id, question_id)?;
        conn.query_row(
            "SELECT title FROM coach_session WHERE attempt_id = ?1 AND question_id = ?2 AND session = ?3",
            params![attempt_id, question_id, session],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        .map(Option::flatten)
        .map_err(db)
    }

    /// Name the current coach session; an empty name goes back to its first question
    pub fn rename_coach_session(&self, attempt_id: &str, question_id: &str, title: &str) -> AppResult<()> {
        let conn = self.conn();
        let session = Self::current_session(&conn, attempt_id, question_id)?;
        let title = Some(title.trim()).filter(|t| !t.is_empty());
        conn.execute(
            "INSERT INTO coach_session (attempt_id, question_id, session, title) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (attempt_id, question_id, session) DO UPDATE SET title = excluded.title",
            params![attempt_id, question_id, session, title],
        )
        .map(|_| ())
        .map_err(db)
    }

    /// Delete the question's current session (its name goes with it); the
    /// pane then shows its latest other one
    pub fn clear_coach_messages(&self, attempt_id: &str, question_id: &str) -> AppResult<()> {
        let mut conn = self.conn();
        let session = Self::current_session(&conn, attempt_id, question_id)?;
        let tx = conn.transaction().map_err(db)?;
        for table in ["coach_message", "coach_session"] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE attempt_id = ?1 AND question_id = ?2 AND session = ?3"),
                params![attempt_id, question_id, session],
            )
            .map_err(db)?;
        }
        tx.execute("DELETE FROM coach_current WHERE attempt_id = ?1 AND question_id = ?2", params![attempt_id, question_id])
            .map_err(db)?;
        tx.commit().map_err(db)
    }

    pub fn settings(&self) -> AppResult<Settings> {
        self.setting("exam_desk")
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        self.save_setting("exam_desk", settings)
    }

    /// How far the assistant's agent may go (Settings > Assistant)
    /// What the exam nodes were measured to take on this machine
    pub fn footprint(&self) -> AppResult<Footprint> {
        self.setting("footprint")
    }

    pub fn save_footprint(&self, footprint: &Footprint) -> AppResult<()> {
        self.save_setting("footprint", footprint)
    }

    /// A value kept as JSON under `key`; its default when unset or unreadable
    pub fn setting<T: DeserializeOwned + Default>(&self, key: &str) -> AppResult<T> {
        let json: Option<String> = self
            .conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .map_err(db)?;
        Ok(json.and_then(|json| serde_json::from_str(&json).ok()).unwrap_or_default())
    }

    pub fn save_setting<T: Serialize>(&self, key: &str, value: &T) -> AppResult<()> {
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
        };
        store.save_settings(&settings).unwrap();
        assert_eq!(store.settings().unwrap(), settings);
        // Settings saved by an earlier version: the new ones take their defaults
        store.save_setting("exam_desk", &serde_json::json!({ "desktop_zoom": 2.0, "question_size": 3 })).unwrap();
        let old = store.settings().unwrap();
        assert_eq!((old.desktop_zoom, old.question_size, old.task_width, old.assistant_width), (2.0, 3, 34.0, 380));
        assert!(old.assistant_enabled);
    }

    #[test]
    fn keeps_coach_conversations_per_attempt_and_question() {
        let store = Store::in_memory().unwrap();
        let say = |role, text: &str| CoachMessage { role, text: text.into() };
        let texts = |(_, m): (i64, Vec<CoachMessage>)| m.into_iter().map(|m| m.text).collect::<Vec<_>>();
        store.add_coach_messages("a1", "q1", &[say(Role::User, "hint?"), say(Role::Assistant, "look at PVCs")]).unwrap();
        store.add_coach_messages("a1", "q1", &[say(Role::User, "why?"), say(Role::Assistant, "wrong class")]).unwrap();
        store.add_coach_messages("a1", "q2", &[say(Role::User, "other")]).unwrap();
        assert_eq!(texts(store.coach_messages("a1", "q1").unwrap()), ["hint?", "look at PVCs", "why?", "wrong class"]);
        assert!(store.coach_messages("a2", "q1").unwrap().1.is_empty());
        let sessions = store.coach_sessions("a1").unwrap();
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().any(|(q, s, title, n)| q == "q1" && *s == 0 && title == "hint?" && *n == 4));
        // Renamed: its own name; an empty one goes back to the first question
        store.rename_coach_session("a1", "q1", "  PVC binding ").unwrap();
        assert_eq!(store.coach_session_title("a1", "q1").unwrap().as_deref(), Some("PVC binding"));
        store.rename_coach_session("a1", "q1", "").unwrap();
        assert!(store.coach_sessions("a1").unwrap().iter().any(|(q, _, title, _)| q == "q1" && title == "hint?"));

        // A new session keeps the earlier one; an empty one is not doubled
        let second = store.new_coach_session("a1", "q1").unwrap();
        assert_eq!(second, 1);
        assert_eq!(store.new_coach_session("a1", "q1").unwrap(), 1);
        assert!(store.coach_messages("a1", "q1").unwrap().1.is_empty());
        store.add_coach_messages("a1", "q1", &[say(Role::User, "again")]).unwrap();
        assert_eq!(store.coach_sessions("a1").unwrap().iter().filter(|(q, ..)| q == "q1").count(), 2);
        // Back to the first, and History reads them all
        store.open_coach_session("a1", "q1", 0).unwrap();
        assert_eq!(texts(store.coach_messages("a1", "q1").unwrap())[0], "hint?");
        assert_eq!(store.coach_transcripts("a1").unwrap().len(), 3);
        assert_eq!(store.coached_attempts().unwrap(), ["a1"]);
        // Deleting the one shown: the latest other shows
        store.clear_coach_messages("a1", "q1").unwrap();
        assert_eq!(texts(store.coach_messages("a1", "q1").unwrap()), ["again"]);
        assert_eq!(store.coach_messages("a1", "q2").unwrap().1.len(), 1);
    }

    #[test]
    fn moves_kept_conversations_into_sessions() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATIONS[0]).unwrap();
        conn.execute_batch(MIGRATIONS[1]).unwrap();
        conn.execute_batch(MIGRATIONS[2]).unwrap();
        conn.execute_batch(MIGRATIONS[3]).unwrap();
        conn.pragma_update(None, "user_version", 4).unwrap();
        conn.execute_batch(
            "INSERT INTO coach_message VALUES ('a', 'q', 0, 'user', 'kept?');
             INSERT INTO coach_message VALUES ('a', 'q', 1, 'assistant', 'yes');
             INSERT INTO coach_session VALUES ('a', 'q', 'Old name');",
        )
        .unwrap();
        let store = Store::with(conn).unwrap();
        let (session, messages) = store.coach_messages("a", "q").unwrap();
        assert_eq!((session, messages.len()), (0, 2));
        assert_eq!(store.coach_session_title("a", "q").unwrap().as_deref(), Some("Old name"));
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
