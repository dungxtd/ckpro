//! What the coach and the study plan may know about attempts.

use crate::sync::MutexExt;
use super::*;

/// How the candidate did in one curriculum domain, over all attempts
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct DomainStat {
    pub domain: String,
    /// Share of the exam, in percent (the curriculum)
    pub weight: u32,
    pub points: u32,
    pub max_points: u32,
    /// Questions answered in it
    pub questions: u32,
}

/// One certification's results so far
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct StudyStats {
    pub certification: String,
    pub title: String,
    /// Attempt scores, oldest first
    pub scores: Vec<f64>,
    /// Heaviest domain first
    pub domains: Vec<DomainStat>,
}

/// A question as the practice coach sees it (see `Exams::coach_subject`)
pub struct CoachSubject {
    pub attempt_id: String,
    pub certification: String,
    pub kubernetes: String,
    pub domain: Option<String>,
    /// Allowed documentation (URL prefixes)
    pub docs: Vec<String>,
    /// The reference answer, once the candidate opened it (always in review)
    pub solution: Option<Solution>,
    /// The attempt has its result: reviewing, no longer practising
    pub review: bool,
    pub cluster: String,
    pub jumphost: String,
    /// The question as the candidate reads it (vars filled in)
    pub view: QuestionView,
}

impl Exams {
    /// What the practice coach may know about a question: only while a
    /// practice attempt runs, or once an attempt has its result. Never during
    /// an exam-mode attempt (the real exam has no assistant). The solution
    /// comes along only if the candidate has opened it.
    pub fn coach_subject(&self, question_id: &str, solution_opened: bool) -> AppResult<CoachSubject> {
        let pack = self.pack();
        let (attempt, review) = match self.state() {
            ExamState::Running { attempt, .. } if attempt.mode == Mode::Practice => (attempt, false),
            // The exam is over: the review may show everything
            ExamState::Finished { attempt, .. } => (attempt, true),
            ExamState::Running { attempt, .. } if attempt.mode == Mode::Exam => return Err(AppError::exam_mode()),
            _ => return Err(AppError::invalid("the coach is available in practice mode and after the exam")),
        };
        let question = self.question(question_id)?;
        let view = attempt
            .questions
            .iter()
            .find(|q| q.id == question_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("question {question_id}")))?;
        let certification = pack.pack.certifications.get(&attempt.certification);
        let session = self.session.locked().clone();
        Ok(CoachSubject {
            attempt_id: attempt.id.clone(),
            certification: certification.map(|c| c.title.clone()).unwrap_or_else(|| attempt.certification.clone()),
            kubernetes: certification.map(|c| c.kubernetes.clone()).unwrap_or_default(),
            domain: question.certifications.get(&attempt.certification).cloned(),
            docs: self.allowed_docs(&attempt.certification, &session),
            solution: (solution_opened || review).then(|| question.solution.clone()),
            review,
            cluster: question.cluster.clone(),
            jumphost: self.jumphost.name.clone(),
            view,
        })
    }

    /// An attempt under way runs on the cluster (closing it removes it)
    pub fn uses_cluster(&self, cluster: &str) -> bool {
        let state = self.state();
        !matches!(state, ExamState::Finished { .. } | ExamState::Idle)
            && state.attempt().is_some_and(|a| a.clusters.iter().any(|c| c == cluster))
    }

    /// An exam-mode attempt is under way (no assistant then, as on the real exam)
    pub fn exam_in_progress(&self) -> bool {
        self.state().exam_in_progress()
    }

    /// The one guard of every assistant entry: refused while an exam-mode
    /// attempt runs, as in the real exam
    pub fn assistant_allowed(&self) -> AppResult<()> {
        if self.exam_in_progress() { Err(AppError::exam_mode()) } else { Ok(()) }
    }

    /// How the candidate did per curriculum domain, per certification they
    /// have attempted, from the history (newest scores last)
    pub fn study_stats(&self) -> Vec<StudyStats> {
        study_stats(&self.pack(), &self.history())
    }

    /// The attempt the coach works in (practice mode, or with its result)
    pub fn coach_attempt(&self) -> Option<String> {
        match self.state() {
            ExamState::Running { attempt, .. } if attempt.mode == Mode::Practice => Some(attempt.id),
            ExamState::Finished { attempt, .. } => Some(attempt.id),
            _ => None,
        }
    }

    /// The documentation the current attempt's desktop may open
    pub fn attempt_docs(&self) -> Vec<String> {
        let certification = match self.state() {
            ExamState::Running { attempt, .. } | ExamState::Finished { attempt, .. } => attempt.certification,
            _ => return Vec::new(),
        };
        let session = self.session.locked().clone();
        self.allowed_docs(&certification, &session)
    }
}

/// Results per certification and curriculum domain, over `history`
pub fn study_stats(pack: &LoadedPack, history: &[HistoryEntry]) -> Vec<StudyStats> {
    let mut stats: Vec<StudyStats> = Vec::new();
    for entry in history.iter().rev() {
        // Kept with the entry: its exam may be deleted since
        let cert_id = entry.certification.clone();
        let Some(cert) = pack.pack.certifications.get(&cert_id) else { continue };
        let i = match stats.iter().position(|s| s.certification == cert_id) {
            Some(i) => i,
            None => {
                let mut domains: Vec<DomainStat> = cert
                    .domains
                    .iter()
                    .map(|(domain, weight)| DomainStat { domain: domain.clone(), weight: *weight, points: 0, max_points: 0, questions: 0 })
                    .collect();
                domains.sort_by(|a, b| b.weight.cmp(&a.weight));
                stats.push(StudyStats { certification: cert_id.clone(), title: cert.title.clone(), scores: Vec::new(), domains });
                stats.len() - 1
            }
        };
        let stat = &mut stats[i];
        stat.scores.push(entry.result.score);
        for q in &entry.result.questions {
            let domain = pack.questions.get(&q.id).and_then(|l| l.value.certifications.get(&cert_id));
            if let Some(d) = domain.and_then(|d| stat.domains.iter_mut().find(|s| &s.domain == d)) {
                d.points += q.points;
                d.max_points += q.max_points;
                d.questions += 1;
            }
        }
    }
    stats
}
