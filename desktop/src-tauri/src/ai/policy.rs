//! How far the assistant's agent may go on its own: the candidate's settings
//! (Settings > Assistant), and which commands are only reading.

use serde::{Deserialize, Serialize};

/// Which of the agent's commands run without asking the candidate first
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AgentPermission {
    /// Every command waits for Run
    #[default]
    Confirm,
    /// Commands that only read (get, describe, logs…) run; others wait
    ReadOnly,
    /// Every command runs (the never-run list still applies)
    All,
}

/// The agent behind the assistant (each runs over ACP with its own adapter)
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    /// Claude Code, through the Claude Agent adapter
    #[default]
    Claude,
}

/// Where the assistant runs
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Runtime {
    /// This Mac's Claude CLI when it is there (its own login), else Docker
    #[default]
    Auto,
    /// This Mac's Claude CLI and its login (needs Node.js for the adapter)
    Mac,
    /// The agent image, its login in a Docker volume: nothing on the Mac
    Docker,
}

/// The assistant's settings, kept in the database
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AgentSettings {
    /// The agent new sessions use
    pub provider: Provider,
    /// The profile a new app run starts in
    pub default_profile: super::Profile,
    pub permission: AgentPermission,
    /// How long one command may run, in seconds
    pub command_timeout: u32,
    /// Text that, found in a command, keeps it from running (the candidate's
    /// own, besides the built-in list)
    pub never_run: Vec<String>,
    /// Name sessions from their first question
    pub auto_titles: bool,
    pub runtime: Runtime,
    /// A Claude CLI to use instead of the one found on this Mac
    pub claude_path: Option<String>,
    /// What Claude may be given: the last check, a look at the cluster
    pub share_checks: bool,
    pub share_cluster: bool,
    /// Claude Code's usage and error reports to Anthropic
    pub telemetry: bool,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: Provider::Claude,
            default_profile: super::Profile::Ask,
            permission: AgentPermission::Confirm,
            command_timeout: 60,
            never_run: Vec::new(),
            auto_titles: true,
            runtime: Runtime::Auto,
            claude_path: None,
            share_checks: true,
            share_cluster: true,
            telemetry: false,
        }
    }
}

/// Longest a command may run, whatever the settings say
pub const COMMAND_MAX_SECS: u32 = 300;

impl AgentSettings {
    /// Within bounds, the list trimmed
    pub fn normalized(mut self) -> Self {
        self.command_timeout = self.command_timeout.clamp(5, COMMAND_MAX_SECS);
        self.never_run = self.never_run.into_iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
        self.never_run.dedup();
        self.claude_path = self.claude_path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
        self
    }

    /// Whether `command` runs without asking
    pub fn runs_unasked(&self, command: &str) -> bool {
        match self.permission {
            AgentPermission::Confirm => false,
            AgentPermission::ReadOnly => read_only(command),
            AgentPermission::All => true,
        }
    }

    /// The candidate's own entry `command` contains, if any
    pub fn never_runs(&self, command: &str) -> Option<&str> {
        let command = normalize(command);
        self.never_run.iter().map(String::as_str).find(|p| command.contains(&normalize(p)))
    }
}

fn normalize(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Whether every part of `command` only reads: kubectl and helm queries,
/// piped through text filters. Anything else (a redirect, a substitution, a
/// write) is not
pub fn read_only(command: &str) -> bool {
    if command.contains('>') || command.contains('`') || command.contains("$(") || command.contains('\n') {
        return false;
    }
    let steps = command.split("&&").flat_map(|s| s.split("||")).flat_map(|s| s.split(';'));
    steps.into_iter().all(|step| {
        let mut pipeline = step.split('|');
        let first = pipeline.next().unwrap_or_default().split_whitespace().collect::<Vec<_>>();
        let reads = match first.as_slice() {
            ["kubectl" | "k", verb, rest @ ..] => {
                matches!(*verb, "get" | "describe" | "logs" | "top" | "explain" | "api-resources" | "api-versions" | "version" | "events" | "cluster-info")
                    || matches!((*verb, rest.first().copied()), ("auth", Some("can-i")) | ("config", Some("view" | "get-contexts" | "current-context")))
            }
            ["helm", verb, rest @ ..] => {
                matches!(*verb, "list" | "ls" | "status" | "get" | "history" | "show" | "search" | "version")
                    || matches!((*verb, rest.first().copied()), ("repo", Some("list")))
            }
            [] => true,
            _ => false,
        };
        let filters = pipeline.all(|f| {
            matches!(f.split_whitespace().next(), Some("grep" | "egrep" | "head" | "tail" | "wc" | "sort" | "uniq" | "cut" | "awk" | "jq" | "yq" | "column" | "less" | "cat"))
        });
        reads && filters
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reading_commands_are_told_apart() {
        for ok in ["kubectl get pods -A", "k describe pvc data -n s", "kubectl logs web | grep -i error | tail -5", "kubectl auth can-i list pods && helm list -A"] {
            assert!(read_only(ok), "{ok}");
        }
        for no in ["kubectl delete pod web", "kubectl get pod web -o yaml > web.yaml", "kubectl apply -f x.yaml", "ssh node01 'crictl ps'", "kubectl get pods; rm -rf /tmp/x", "echo $(kubectl get pods)"] {
            assert!(!read_only(no), "{no}");
        }
    }

    #[test]
    fn settings_decide_what_runs_and_what_never_does() {
        let mut s = AgentSettings { never_run: vec!["  Delete   Namespace ".into(), "".into()], ..Default::default() }.normalized();
        assert_eq!(s.never_run, ["Delete   Namespace"]);
        assert_eq!(s.never_runs("kubectl delete  namespace prod"), Some("Delete   Namespace"));
        assert!(!s.runs_unasked("kubectl get pods"));
        s.permission = AgentPermission::ReadOnly;
        assert!(s.runs_unasked("kubectl get pods") && !s.runs_unasked("kubectl scale deploy/web --replicas=2"));
        assert_eq!(AgentSettings { command_timeout: 9999, ..Default::default() }.normalized().command_timeout, COMMAND_MAX_SECS);
    }
}
