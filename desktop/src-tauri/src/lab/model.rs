//! Lab format v1. These types are the single source of truth: the loader
//! parses YAML into them and `ckpro schema` generates the JSON Schemas that
//! editors (and AI authors) validate against.
//!
//! A pack is a directory:
//!   pack.yaml                 pack metadata + certification blueprints
//!   questions/**/<name>.yaml  the question bank; id = path without .yaml
//!   exams/<name>.yaml         exams: fixed or drawn from the bank

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// `pack.yaml`
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pack {
    /// Prefix of every question and exam id in the pack, e.g. `core`
    pub id: String,
    pub title: String,
    pub version: String,
    /// Certification blueprints, keyed by exam id (`cka`, `ckad`, `cks`)
    #[serde(default)]
    pub certifications: BTreeMap<String, Certification>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Certification {
    pub title: String,
    /// Kubernetes minor version the exam runs, e.g. "1.35"
    pub kubernetes: String,
    /// Passing score in percent
    pub pass_score: u32,
    /// Exam length, e.g. "120m"
    pub duration: Duration,
    /// Curriculum domains and their weight in percent
    pub domains: BTreeMap<String, u32>,
    /// Documentation the exam desktop's browser may open (URL prefixes, the
    /// certification's "Resources Allowed"); a question's `references` are
    /// added during its exam. Search on these sites is allowed.
    #[serde(default)]
    pub resources: Vec<String>,
}

/// One task. `{{var}}` placeholders in text and scripts are filled from `vars`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Question {
    pub title: String,
    /// Certifications this question belongs to, each with the curriculum
    /// domain it falls under there (domain names differ per certification)
    pub certifications: BTreeMap<String, String>,
    #[serde(default)]
    pub difficulty: Difficulty,
    /// Suggested time, e.g. "6m"
    #[serde(default)]
    pub estimate: Option<Duration>,
    /// Cluster (kubeconfig context) the task is solved in
    #[serde(default = "default_cluster")]
    pub cluster: String,
    /// Worker nodes the task needs in that cluster
    #[serde(default = "default_workers")]
    pub workers: u8,
    #[serde(default)]
    pub namespace: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Capabilities the question needs beyond a cluster and the jumphost.
    /// Questions needing one ckpro does not provide are left out of exams and
    /// verify runs.
    #[serde(default)]
    pub requires: Vec<Capability>,
    /// Values picked once per attempt so answers cannot be memorised
    #[serde(default)]
    pub vars: BTreeMap<String, Var>,
    /// The task, in Markdown
    pub statement: String,
    /// Shell script run on the jumphost before the exam starts
    #[serde(default)]
    pub setup: Option<String>,
    pub checks: Vec<Check>,
    /// Shown only in practice mode, one at a time
    #[serde(default)]
    pub hints: Vec<String>,
    /// Reference answer. `run` must make every check pass (`ckpro lab verify`)
    pub solution: Solution,
    /// Documentation allowed in the exam (kubernetes.io/docs, ...)
    #[serde(default)]
    pub references: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    Easy,
    #[default]
    Medium,
    Hard,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    /// Build and run images on the candidate's machine (docker / podman)
    ContainerRuntime,
}

impl Capability {
    /// Whether ckpro can offer it
    pub fn available(self) -> bool {
        match self {
            Capability::ContainerRuntime => false,
        }
    }
}

impl Question {
    /// Every capability it needs is available
    pub fn runnable(&self) -> bool {
        self.requires.iter().all(|c| c.available())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Var {
    /// One value is picked at random per attempt
    pub pick: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Solution {
    /// Why this is the right approach, in Markdown
    pub explain: String,
    /// Commands that solve the task on the jumphost
    pub run: String,
}

/// One graded step. `weight` is its share of the question's points.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// What is checked, shown in results ("ServiceAccount cicd-token exists")
    pub name: String,
    #[serde(default = "default_weight")]
    pub weight: u32,
    #[serde(flatten)]
    pub kind: CheckKind,
}

/// Exactly one kind per check. Prefer the declarative kinds: they explain
/// failures to the candidate; `run` is the escape hatch.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum CheckKind {
    /// The resource exists (or, with `absent: true`, does not)
    Exists(ResourceRef),
    /// A JSONPath on a resource matches
    Jsonpath(JsonpathCheck),
    /// A pod is Ready / a workload has all replicas available
    Ready(ResourceRef),
    /// `kubectl auth can-i` gives the expected answer
    CanI(CanICheck),
    /// Any script: exit code 0 passes. Runs on the jumphost
    Run(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceRef {
    /// `kind/name`, e.g. `deployment/web`
    pub resource: String,
    #[serde(default)]
    pub namespace: Option<String>,
    /// For `exists`: pass when the resource is absent
    #[serde(default)]
    pub absent: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JsonpathCheck {
    pub resource: String,
    #[serde(default)]
    pub namespace: Option<String>,
    /// kubectl JSONPath, e.g. `{.spec.replicas}`
    pub path: String,
    #[serde(flatten)]
    pub expect: Expectation,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Expectation {
    Equals(String),
    Contains(String),
    /// Regular expression
    Matches(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CanICheck {
    /// User or `system:serviceaccount:<ns>:<name>`
    #[serde(rename = "as")]
    pub as_user: String,
    pub verb: String,
    pub resource: String,
    #[serde(default)]
    pub namespace: Option<String>,
    #[serde(default = "default_true")]
    pub expect: bool,
}

/// `exams/<name>.yaml`: a fixed list, a draw by domain weight, or both.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Exam {
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Certification blueprint (a key of `certifications`)
    pub certification: String,
    /// Defaults to the certification's duration
    #[serde(default)]
    pub duration: Option<Duration>,
    /// Defaults to the certification's pass score
    #[serde(default)]
    pub pass_score: Option<u32>,
    /// Question ids, always included, in this order
    #[serde(default)]
    pub questions: Vec<String>,
    /// Extra questions drawn at random from the bank
    #[serde(default)]
    pub random: Option<RandomDraw>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RandomDraw {
    pub count: u32,
    /// Domain weights; defaults to the certification's
    #[serde(default)]
    pub weights: Option<BTreeMap<String, u32>>,
}

/// A length like "120m", "2h" or "90s"
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct Duration(#[schemars(regex(pattern = r"^\d+(s|m|h)$"))] pub String);

impl Duration {
    pub fn seconds(&self) -> Option<u64> {
        let (number, unit) = self.0.split_at(self.0.len().checked_sub(1)?);
        let n: u64 = number.parse().ok()?;
        Some(match unit {
            "s" => n,
            "m" => n * 60,
            "h" => n * 3600,
            _ => return None,
        })
    }
}

fn default_cluster() -> String {
    "k8s".into()
}
fn default_workers() -> u8 {
    1
}
fn default_weight() -> u32 {
    1
}
fn default_true() -> bool {
    true
}
