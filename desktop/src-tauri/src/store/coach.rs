//! Coach conversations: per attempt and question, in sessions

use super::{Role, Store, db};
use crate::error::AppResult;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

/// A coach session read back: question, session, title, messages
pub type Transcript = (String, i64, String, Vec<CoachMessage>);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct CoachMessage {
    pub role: Role,
    pub text: String,
}

impl Store {
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
            .query_map(params![attempt_id, question_id, session], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
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
        let rows = stmt.query_map(params![attempt_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).map_err(db)?;
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
        tx.execute("DELETE FROM coach_current WHERE attempt_id = ?1 AND question_id = ?2", params![attempt_id, question_id]).map_err(db)?;
        tx.commit().map_err(db)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{MIGRATIONS, Store};

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
}
