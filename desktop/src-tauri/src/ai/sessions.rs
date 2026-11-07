//! Coach sessions: a question's conversations, kept with the attempt, and
//! the agent's session behind the one open

use super::prompt::{AGENT, followup, prompt, system};
use super::{Coach, Profile};
use crate::error::{AppError, AppResult};
use crate::lab::checks::CheckResult;
use crate::lab::exam::{CoachSubject, Exams};
use crate::store::{CoachMessage, Store};
use serde::{Deserialize, Serialize};

/// A coach session of the attempt: one per question asked about (the
/// panel's history)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachSession {
    pub question_id: String,
    /// Which of the question's sessions (0 is its first)
    pub session: u32,
    /// Its own name, else its first question
    pub title: String,
    pub messages: u32,
}

/// A question's coach session: its own name (if renamed) and its messages
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachHistory {
    pub session: u32,
    pub title: Option<String>,
    pub messages: Vec<CoachMessage>,
}

/// A finished attempt's session, read back in History
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct CoachTranscript {
    pub question_id: String,
    pub session: u32,
    pub title: String,
    pub messages: Vec<CoachMessage>,
}

impl Coach {
    pub fn history(exams: &Exams, store: &Store, question_id: &str) -> AppResult<CoachHistory> {
        let subject = exams.coach_subject(question_id)?;
        let (session, messages) = store.coach_messages(&subject.attempt_id, question_id)?;
        Ok(CoachHistory { session: session as u32, title: store.coach_session_title(&subject.attempt_id, question_id)?, messages })
    }

    /// A new session for the question; the earlier ones stay in History
    pub async fn new_session(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.new_coach_session(&subject.attempt_id, question_id).map(|_| ())
    }

    /// Go back to an earlier session of the question
    pub async fn open_session(&self, exams: &Exams, store: &Store, question_id: &str, session: u32) -> AppResult<()> {
        let subject = exams.coach_subject(question_id)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.open_coach_session(&subject.attempt_id, question_id, i64::from(session))
    }

    /// The agent's conversation for the question ends: the next question
    /// starts one from the session the pane shows
    pub(super) async fn forget_session(&self, attempt_id: &str, question_id: &str) {
        let removed = self.open.lock().await.remove(&(attempt_id.to_string(), question_id.to_string()));
        if let Some((session, ..)) = removed {
            self.agent.close(&session).await;
        }
    }

    /// The attempts that have sessions
    pub fn coached_attempts(store: &Store) -> AppResult<Vec<String>> {
        store.coached_attempts()
    }

    /// Every session of a past attempt, to read back (History)
    pub fn transcripts(store: &Store, attempt_id: &str) -> AppResult<Vec<CoachTranscript>> {
        Ok(store
            .coach_transcripts(attempt_id)?
            .into_iter()
            .map(|(question_id, session, title, messages)| CoachTranscript { question_id, session: session as u32, title, messages })
            .collect())
    }

    /// The attempt's coach sessions, one per question asked about
    pub fn sessions(exams: &Exams, store: &Store) -> AppResult<Vec<CoachSession>> {
        let Some(attempt) = exams.coach_attempt() else { return Ok(Vec::new()) };
        Ok(store
            .coach_sessions(&attempt)?
            .into_iter()
            .map(|(question_id, session, title, messages)| CoachSession { question_id, session: session as u32, title, messages })
            .collect())
    }

    /// Name a question's coach session; empty: back to its first question
    pub fn rename(exams: &Exams, store: &Store, question_id: &str, title: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id)?;
        store.rename_coach_session(&subject.attempt_id, question_id, title)
    }

    /// Delete the question's session shown (the panel's Delete Session)
    pub async fn clear(&self, exams: &Exams, store: &Store, question_id: &str) -> AppResult<()> {
        let subject = exams.coach_subject(question_id)?;
        self.forget_session(&subject.attempt_id, question_id).await;
        store.clear_coach_messages(&subject.attempt_id, question_id)
    }

    /// The agent's session for the question, and what to send it: the one
    /// open (only what changed since), or a new one (the task and what was
    /// said before). Another profile is another session (other tools)
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn session_for(
        &self,
        store: &Store,
        subject: &CoachSubject,
        question_id: &str,
        profile: Profile,
        model: &str,
        effort: &str,
        checks: &[CheckResult],
        snapshot: Option<&str>,
        text: &str,
    ) -> AppResult<(String, String)> {
        let key = (subject.attempt_id.clone(), question_id.to_string());
        // Read, then let go: a `match` keeps the lock for its whole body
        let existing = self.open.lock().await.get(&key).cloned();
        let opened = match existing {
            Some((session, .., open_profile)) if open_profile != profile => {
                self.agent.close(&session).await;
                None
            }
            opened => opened,
        };
        let (session, prompt) = match opened {
            Some((session, current, current_effort, _)) => {
                if current != model {
                    self.agent.set_model(&session, model).await?;
                }
                if current != model || current_effort != effort {
                    self.agent.set_effort(&session, model, effort).await?;
                }
                (session, followup(checks, snapshot, text))
            }
            None => {
                let session = match profile {
                    Profile::Ask => self.agent.new_session(&system(subject), model).await?,
                    Profile::Agent => {
                        let system = format!("{}\n{AGENT}", system(subject));
                        let tools = self.tools.get().ok_or_else(|| AppError::assistant("the agent's tools are not ready yet; try again"))?;
                        self.agent.new_session_with(&system, model, serde_json::json!([tools.server_for(question_id)])).await?
                    }
                };
                self.agent.set_effort(&session, model, effort).await?;
                let (_, history) = store.coach_messages(&subject.attempt_id, question_id)?;
                (session, prompt(subject, checks, snapshot, &history, text))
            }
        };
        self.open.lock().await.insert(key, (session.clone(), model.to_string(), effort.to_string(), profile));
        Ok((session, prompt))
    }
}
