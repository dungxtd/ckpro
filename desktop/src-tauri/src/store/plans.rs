//! Exams planned for a day (the Calendar)

use super::{Store, db};
use crate::error::{AppError, AppResult};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

/// An exam planned for a day, as kept
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct StoredPlan {
    pub id: i32,
    /// YYYY-MM-DD, in the candidate's own time
    pub day: String,
    pub exam_id: String,
    /// "exam" or "practice"
    pub mode: String,
}

impl Store {
    /// Plans from `from` to `to` (YYYY-MM-DD, both included), by day then as added
    pub fn plans(&self, from: &str, to: &str) -> AppResult<Vec<StoredPlan>> {
        let conn = self.conn();
        let mut query = conn
            .prepare("SELECT id, day, exam_id, mode FROM plan WHERE day >= ?1 AND day <= ?2 ORDER BY day, id")
            .map_err(db)?;
        let rows = query
            .query_map(params![from, to], |r| {
                Ok(StoredPlan { id: r.get(0)?, day: r.get(1)?, exam_id: r.get(2)?, mode: r.get(3)? })
            })
            .map_err(db)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db)
    }

    /// Plan an exam on a day; returns its id. An exam is planned once a day:
    /// planned there already, it is refused (taken the other way, it is changed)
    pub fn add_plan(&self, day: &str, exam_id: &str, mode: &str) -> AppResult<i32> {
        let conn = self.conn();
        if planned(&conn, day, exam_id, None)? {
            return Err(AppError::invalid("That exam is planned on that day already"));
        }
        conn.execute(
            "INSERT INTO plan (day, exam_id, mode, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![day, exam_id, mode, crate::runtime::activity::now_ms() as i64],
        )
        .map_err(db)?;
        // Plans stay few: an id fits an i32 (what the interface can hold)
        Ok(conn.last_insert_rowid() as i32)
    }

    /// Move a plan to another day, or take it another way; nothing when it is
    /// gone. Not onto a day the same exam is planned already
    pub fn update_plan(&self, id: i32, day: Option<&str>, mode: Option<&str>) -> AppResult<()> {
        let conn = self.conn();
        if let Some(day) = day {
            let exam: Option<String> = conn
                .query_row("SELECT exam_id FROM plan WHERE id = ?1", params![id], |r| r.get(0))
                .optional()
                .map_err(db)?;
            if let Some(exam) = exam
                && planned(&conn, day, &exam, Some(id))?
            {
                return Err(AppError::invalid("That exam is planned on that day already"));
            }
            conn.execute("UPDATE plan SET day = ?1 WHERE id = ?2", params![day, id]).map_err(db)?;
        }
        if let Some(mode) = mode {
            conn.execute("UPDATE plan SET mode = ?1 WHERE id = ?2", params![mode, id]).map_err(db)?;
        }
        Ok(())
    }

    /// The exams were deleted: their plans go with them
    pub fn remove_plans_of(&self, exam_ids: &[String]) -> AppResult<()> {
        let conn = self.conn();
        for id in exam_ids {
            conn.execute("DELETE FROM plan WHERE exam_id = ?1", params![id]).map_err(db)?;
        }
        Ok(())
    }

    pub fn remove_plan(&self, id: i32) -> AppResult<()> {
        self.conn().execute("DELETE FROM plan WHERE id = ?1", params![id]).map_err(db)?;
        Ok(())
    }
}

/// Whether `exam_id` is planned on `day` (by a plan other than `except`)
fn planned(conn: &rusqlite::Connection, day: &str, exam_id: &str, except: Option<i32>) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM plan WHERE day = ?1 AND exam_id = ?2 AND id IS NOT ?3)",
        params![day, exam_id, except],
        |r| r.get(0),
    )
    .map_err(db)
}

#[cfg(test)]
mod tests {
    use crate::store::Store;

    #[test]
    fn plans_are_kept_by_day() {
        let store = Store::in_memory().unwrap();
        let a = store.add_plan("2026-11-05", "cka-002", "exam").unwrap();
        let b = store.add_plan("2026-11-03", "cka-001", "practice").unwrap();
        store.add_plan("2026-12-01", "cks-001", "practice").unwrap();
        let days = |from, to| store.plans(from, to).unwrap().into_iter().map(|p| (p.day, p.exam_id)).collect::<Vec<_>>();
        assert_eq!(days("2026-11-01", "2026-11-30"), [("2026-11-03".into(), "cka-001".into()), ("2026-11-05".into(), "cka-002".into())]);
        store.update_plan(a, Some("2026-11-02"), Some("practice")).unwrap();
        store.remove_plan(b).unwrap();
        let left = store.plans("2026-11-01", "2026-11-30").unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!((left[0].day.as_str(), left[0].mode.as_str()), ("2026-11-02", "practice"));
    }

    /// An exam is planned once a day: added again, or moved onto its own day,
    /// it is refused; another day, or another exam that day, is fine
    #[test]
    fn an_exam_is_planned_once_a_day() {
        let store = Store::in_memory().unwrap();
        let a = store.add_plan("2026-11-05", "cka-001", "exam").unwrap();
        assert!(store.add_plan("2026-11-05", "cka-001", "practice").is_err());
        store.add_plan("2026-11-05", "cka-002", "exam").unwrap();
        let b = store.add_plan("2026-11-06", "cka-001", "practice").unwrap();
        assert!(store.update_plan(b, Some("2026-11-05"), None).is_err());
        // Its own day, or only its mode: fine
        store.update_plan(a, Some("2026-11-05"), Some("practice")).unwrap();
        store.update_plan(b, None, Some("exam")).unwrap();
        assert_eq!(store.plans("2026-11-01", "2026-11-30").unwrap().len(), 3);
    }
}
