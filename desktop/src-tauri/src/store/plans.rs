//! Exams planned for a day (the Calendar)

use super::{Store, db};
use crate::error::{AppError, AppResult};
use crate::lab::exam::Mode;
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// An exam planned for a day, as kept
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct StoredPlan {
    pub id: i32,
    /// YYYY-MM-DD, in the candidate's own time
    pub day: String,
    pub exam_id: String,
    pub mode: Mode,
}

/// A mode is kept by its name, as serde gives it ("exam", "practice")
impl ToSql for Mode {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(match self {
            Mode::Exam => "exam",
            Mode::Practice => "practice",
        }))
    }
}

impl FromSql for Mode {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value.as_str()? {
            "exam" => Ok(Mode::Exam),
            "practice" => Ok(Mode::Practice),
            other => Err(FromSqlError::Other(format!("not a mode: {other}").into())),
        }
    }
}

/// Planned there already: the one refusal of a plan
fn planned_already() -> AppError {
    AppError::invalid("That exam is planned on that day already")
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

    /// Plan an exam on a day; returns its id. An exam is planned once a day
    /// (the database holds it): planned there already, it is refused with
    /// `AppError::Invalid`, the only refusal that is
    pub fn add_plan(&self, day: &str, exam_id: &str, mode: Mode) -> AppResult<i32> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO plan (day, exam_id, mode, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![day, exam_id, mode, crate::runtime::activity::now_ms() as i64],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => planned_already(),
            e => db(e),
        })?;
        // Plans stay few: an id fits an i32 (what the interface can hold)
        Ok(conn.last_insert_rowid() as i32)
    }

    pub fn remove_plan(&self, id: i32) -> AppResult<()> {
        self.conn().execute("DELETE FROM plan WHERE id = ?1", params![id]).map_err(db)?;
        Ok(())
    }
}

/// The exams were deleted: their plans go with them (in the deletion's transaction)
pub(super) fn remove_plans_of(conn: &rusqlite::Connection, exam_ids: &[String]) -> AppResult<()> {
    for id in exam_ids {
        conn.execute("DELETE FROM plan WHERE exam_id = ?1", params![id]).map_err(db)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::lab::exam::Mode;
    use crate::store::Store;
    use rusqlite::params;

    #[test]
    fn plans_are_kept_by_day() {
        let store = Store::in_memory().unwrap();
        store.add_plan("2026-11-05", "cka-002", Mode::Exam).unwrap();
        let b = store.add_plan("2026-11-03", "cka-001", Mode::Practice).unwrap();
        store.add_plan("2026-12-01", "cks-001", Mode::Practice).unwrap();
        let days = |from, to| store.plans(from, to).unwrap().into_iter().map(|p| (p.day, p.exam_id)).collect::<Vec<_>>();
        assert_eq!(days("2026-11-01", "2026-11-30"), [("2026-11-03".into(), "cka-001".into()), ("2026-11-05".into(), "cka-002".into())]);
        store.remove_plan(b).unwrap();
        let left = store.plans("2026-11-01", "2026-11-30").unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!((left[0].day.as_str(), left[0].mode), ("2026-11-05", Mode::Exam));
    }

    /// An exam is planned once a day: added again, in either mode, it is
    /// refused as planned already; another day, or another exam that day,
    /// is fine
    #[test]
    fn an_exam_is_planned_once_a_day() {
        let store = Store::in_memory().unwrap();
        store.add_plan("2026-11-05", "cka-001", Mode::Exam).unwrap();
        for mode in [Mode::Exam, Mode::Practice] {
            let again = store.add_plan("2026-11-05", "cka-001", mode);
            assert!(matches!(again, Err(crate::error::AppError::Invalid { .. })), "{again:?}");
        }
        store.add_plan("2026-11-05", "cka-002", Mode::Exam).unwrap();
        store.add_plan("2026-11-06", "cka-001", Mode::Practice).unwrap();
        assert_eq!(store.plans("2026-11-01", "2026-11-30").unwrap().len(), 3);
    }

    /// Duplicates an earlier version let in go when the database learns
    /// the rule: the first planned stays
    #[test]
    fn duplicate_plans_go_the_first_stays() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        // The schema as it was before the rule
        let before = super::super::MIGRATIONS.len() - 1;
        for migration in &super::super::MIGRATIONS[..before] {
            conn.execute_batch(migration).unwrap();
        }
        conn.pragma_update(None, "user_version", before as i64).unwrap();
        for (day, exam, mode) in [("2026-11-05", "a", "exam"), ("2026-11-05", "a", "practice"), ("2026-11-05", "b", "exam"), ("2026-11-06", "a", "practice")] {
            conn.execute("INSERT INTO plan (day, exam_id, mode, created_at) VALUES (?1, ?2, ?3, 0)", params![day, exam, mode]).unwrap();
        }
        let store = Store::with(conn).unwrap();
        let plans = store.plans("2026-11-01", "2026-11-30").unwrap();
        let kept: Vec<(&str, &str, Mode)> = plans.iter().map(|p| (p.day.as_str(), p.exam_id.as_str(), p.mode)).collect();
        assert_eq!(kept, [("2026-11-05", "a", Mode::Exam), ("2026-11-05", "b", Mode::Exam), ("2026-11-06", "a", Mode::Practice)]);
    }
}
