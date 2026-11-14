//! Create with Claude conversations and their drafts

use super::{Role, Store, db};
use crate::error::{AppError, AppResult};
use crate::runtime::activity::now_ms;
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// A message of a Create conversation; an answer keeps the tools Claude used
/// for it
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct StudioMessage {
    pub role: Role,
    pub text: String,
    #[serde(default)]
    pub tools: Vec<ToolUse>,
}

/// A tool Claude used: what it asked and what came back
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ToolUse {
    pub id: String,
    pub name: String,
    /// pending, in_progress, completed, failed
    pub status: String,
    /// Its arguments, as JSON
    pub input: String,
    /// What it returned, once it did
    pub output: Option<String>,
    /// How long it took, in milliseconds
    pub ms: Option<u32>,
}

/// A Create with Claude conversation, listed: its id, title (its own name,
/// else its first message) and when it last changed (Unix ms)
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct StudioSessionRow {
    pub id: i32,
    pub title: String,
    pub updated_at: f64,
}

/// Reads of a draft changed meanwhile before a change of it gives up
const DRAFT_TRIES: usize = 5;

impl Store {
    /// A new conversation; its id
    pub fn studio_new(&self) -> AppResult<i32> {
        let conn = self.conn();
        conn.execute("INSERT INTO studio_session (title, updated_at) VALUES (NULL, ?1)", params![now_ms() as i64]).map_err(db)?;
        Ok(conn.last_insert_rowid() as i32)
    }

    /// The conversations with something in them, latest first
    pub fn studio_sessions(&self) -> AppResult<Vec<StudioSessionRow>> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare(
                "SELECT s.id,
                        COALESCE(s.title, (SELECT text FROM studio_message m WHERE m.session = s.id AND m.role = 'user' ORDER BY seq LIMIT 1), 'New exam'),
                        s.updated_at
                 FROM studio_session s
                 WHERE EXISTS (SELECT 1 FROM studio_message m WHERE m.session = s.id)
                 ORDER BY s.updated_at DESC",
            )
            .map_err(db)?;
        let rows = stmt
            .query_map([], |r| Ok(StudioSessionRow { id: r.get(0)?, title: r.get(1)?, updated_at: r.get::<_, i64>(2)? as f64 }))
            .map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)
    }

    pub fn studio_messages(&self, session: i32) -> AppResult<Vec<StudioMessage>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT role, text, tools FROM studio_message WHERE session = ?1 ORDER BY seq").map_err(db)?;
        let rows = stmt
            .query_map(params![session], |r| {
                let role: String = r.get(0)?;
                let tools: String = r.get(2)?;
                Ok(StudioMessage {
                    role: if role == "user" { Role::User } else { Role::Assistant },
                    text: r.get(1)?,
                    tools: serde_json::from_str(&tools).unwrap_or_default(),
                })
            })
            .map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)
    }

    /// Append to a conversation (a message and its answer together)
    pub fn studio_add_messages(&self, session: i32, messages: &[StudioMessage]) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db)?;
        let next: i64 = tx
            .query_row("SELECT COALESCE(MAX(seq) + 1, 0) FROM studio_message WHERE session = ?1", params![session], |r| r.get(0))
            .map_err(db)?;
        for (i, m) in messages.iter().enumerate() {
            let role = if m.role == Role::User { "user" } else { "assistant" };
            let tools = serde_json::to_string(&m.tools).unwrap_or_else(|_| "[]".into());
            tx.execute(
                "INSERT INTO studio_message (session, seq, role, text, tools) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![session, next + i as i64, role, m.text, tools],
            )
            .map_err(db)?;
        }
        tx.execute("UPDATE studio_session SET updated_at = ?2 WHERE id = ?1", params![session, now_ms() as i64]).map_err(db)?;
        tx.commit().map_err(db)
    }


    /// A conversation's draft, as JSON (`{}` before the first)
    pub fn studio_draft(&self, session: i32) -> AppResult<String> {
        self.conn()
            .query_row("SELECT draft FROM studio_session WHERE id = ?1", params![session], |r| r.get(0))
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::not_found(format!("no conversation {session}")),
                e => db(e),
            })
    }

    /// Change a conversation's draft (JSON) with `f`, the store let go while
    /// it works (it may parse and lint at length): the draft is read, `f`
    /// makes the new one from it, and it is written back only if no other
    /// change came between; else it is read again and `f` runs again, a few
    /// times at most. `writable`, asked with the store held just before the
    /// write, may still refuse it (a proof begun meanwhile). What `f`
    /// returns beside the new draft
    pub fn studio_update_draft<T>(
        &self,
        session: i32,
        writable: impl Fn() -> AppResult<()>,
        mut f: impl FnMut(&str) -> AppResult<(String, T)>,
    ) -> AppResult<T> {
        for _ in 0..DRAFT_TRIES {
            let text = self.studio_draft(session)?;
            let (draft, out) = f(&text)?;
            let conn = self.conn();
            writable()?;
            let written = conn
                .execute(
                    "UPDATE studio_session SET draft = ?2, updated_at = ?3 WHERE id = ?1 AND draft = ?4",
                    params![session, draft, now_ms() as i64, text],
                )
                .map_err(db)?;
            if written == 1 {
                return Ok(out);
            }
        }
        Err(AppError::busy("the exam kept changing as it was changed: try again"))
    }

    pub fn studio_rename(&self, session: i32, title: &str) -> AppResult<()> {
        self.conn()
            .execute("UPDATE studio_session SET title = NULLIF(TRIM(?2), '') WHERE id = ?1", params![session, title])
            .map(|_| ())
            .map_err(db)
    }

    pub fn studio_delete(&self, session: i32) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(db)?;
        tx.execute("DELETE FROM studio_message WHERE session = ?1", params![session]).map_err(db)?;
        tx.execute("DELETE FROM studio_session WHERE id = ?1", params![session]).map_err(db)?;
        tx.commit().map_err(db)
    }
}

/// Every conversation's draft rewritten by `rewrite` (its JSON to the new
/// one, or none to leave it), in the caller's transaction
pub(super) fn rewrite_drafts(conn: &rusqlite::Connection, mut rewrite: impl FnMut(i32, &str) -> AppResult<Option<String>>) -> AppResult<()> {
    let drafts: Vec<(i32, String)> = {
        let mut stmt = conn.prepare("SELECT id, draft FROM studio_session").map_err(db)?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(db)?;
        rows.collect::<Result<_, _>>().map_err(db)?
    };
    for (session, text) in drafts {
        if let Some(draft) = rewrite(session, &text)? {
            conn.execute("UPDATE studio_session SET draft = ?2, updated_at = ?3 WHERE id = ?1", params![session, draft, now_ms() as i64])
                .map_err(db)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    /// A conversation keeps its messages and draft; listed once it has a
    /// message, titled by the first until renamed; deleted whole
    #[test]
    fn studio_conversations_are_kept() {
        let store = Store::open(&std::env::temp_dir().join(format!("ckpro-studio-{}.db", std::process::id()))).unwrap();
        let id = store.studio_new().unwrap();
        assert!(store.studio_sessions().unwrap().is_empty());
        store
            .studio_add_messages(
                id,
                &[
                    StudioMessage { role: Role::User, text: "A CKA mock".into(), tools: vec![] },
                    StudioMessage {
                        role: Role::Assistant,
                        text: "Here".into(),
                        tools: vec![ToolUse { id: "t1".into(), name: "get_profile".into(), status: "completed".into(), input: "{}".into(), output: Some("{}".into()), ms: Some(200) }],
                    },
                ],
            )
            .unwrap();
        store.studio_update_draft(id, || Ok(()), |_| Ok((r#"{"title":"Mock"}"#.to_string(), ()))).unwrap();
        assert_eq!(store.studio_sessions().unwrap()[0].title, "A CKA mock");
        let messages = store.studio_messages(id).unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[1].tools[0].name, "get_profile", "an answer keeps its tools");
        assert_eq!(store.studio_draft(id).unwrap(), r#"{"title":"Mock"}"#);
        store.studio_rename(id, "Weak spots").unwrap();
        assert_eq!(store.studio_sessions().unwrap()[0].title, "Weak spots");
        store.studio_delete(id).unwrap();
        assert!(store.studio_draft(id).is_err());
    }

    /// A change of the draft holds no lock while it works (it may use the
    /// store itself), and one that came between is not written over: the
    /// change runs again on the draft as that left it; a proof begun
    /// meanwhile (`writable`) still refuses it
    #[test]
    fn a_draft_change_is_not_written_over() {
        let store = Store::in_memory().unwrap();
        let id = store.studio_new().unwrap();
        let mut runs = Vec::new();
        let out = store
            .studio_update_draft(id, || Ok(()), |text| {
                runs.push(text.to_string());
                if runs.len() == 1 {
                    // Another change, as this one works
                    store.studio_update_draft(id, || Ok(()), |_| Ok((r#"{"title":"Theirs"}"#.to_string(), ())))?;
                }
                Ok((text.replace("Theirs", "Theirs, then mine"), runs.len()))
            })
            .unwrap();
        assert_eq!(out, 2);
        assert_eq!(runs, ["{}", r#"{"title":"Theirs"}"#]);
        assert_eq!(store.studio_draft(id).unwrap(), r#"{"title":"Theirs, then mine"}"#);
        let refused = store.studio_update_draft(id, || Err(AppError::busy("proving")), |_| Ok(("{}".to_string(), ())));
        assert!(matches!(refused, Err(AppError::Busy { .. })));
        assert_eq!(store.studio_draft(id).unwrap(), r#"{"title":"Theirs, then mine"}"#);
    }
}
