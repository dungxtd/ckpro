//! The Claude login the assistant runs on, read and changed with the Claude
//! CLI (`--cli auth ...` through the adapter).
//! The login itself stays the CLI's (keychain or `~/.claude`): ckpro keeps no
//! credentials.

use super::agent::Agent;
use crate::error::{AppError, AppResult};
use crate::sync::MutexExt;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{ChildStdin, Command};
use tokio_util::sync::CancellationToken;

/// The adapter is fetched by npx on first use: allow for the download
const CLI_TIMEOUT: Duration = Duration::from_secs(90);
/// Long enough to finish signing in in the browser
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(600);

/// Who the assistant answers as
#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
pub struct Account {
    pub signed_in: bool,
    /// "claude.ai" (a Claude plan) or "console" (API billing)
    pub method: Option<String>,
    pub email: Option<String>,
    /// The Claude plan: pro, max, ...
    pub plan: Option<String>,
}

/// Where to sign in: a Claude plan, or the Anthropic Console (API billing)
#[derive(Clone, Copy, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SignInMethod {
    Claude,
    Console,
}

/// A login as it runs
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SignInEvent {
    /// What the CLI printed (terminal codes removed): the sign-in link, then
    /// maybe a prompt for the code the browser shows
    Output { text: String },
}

/// The login being run: its input, and how to stop it
pub struct SigningIn {
    stdin: ChildStdin,
    cancel: CancellationToken,
}

/// `argv` in a pseudo-terminal: the CLI's login is interactive
pub fn in_terminal(argv: &[OsString]) -> Command {
    if cfg!(target_os = "macos") {
        let mut command = Command::new("/usr/bin/script");
        command.arg("-q").arg("/dev/null").args(argv);
        command
    } else if cfg!(target_os = "linux") {
        let line = argv.iter().map(|a| crate::runtime::exec::quote(&a.to_string_lossy())).collect::<Vec<_>>().join(" ");
        let mut command = Command::new("script");
        command.args(["-q", "-e", "-c", &line, "/dev/null"]);
        command
    } else {
        let mut command = Command::new(&argv[0]);
        command.args(&argv[1..]);
        command
    }
}

pub async fn account(agent: &Agent) -> AppResult<Account> {
    let mut command = agent.adapter(&["--cli", "auth", "status", "--json"], false).await?;
    command.stdin(Stdio::null()).stderr(Stdio::null());
    let output = tokio::time::timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::assistant("reading the Claude login timed out"))?
        .map_err(|e| AppError::assistant(format!("reading the Claude login: {e}")))?;
    Ok(parse_status(&String::from_utf8_lossy(&output.stdout)))
}

/// `claude auth status --json`; anything unreadable is signed out
fn parse_status(json: &str) -> Account {
    let Ok(status) = serde_json::from_str::<serde_json::Value>(json) else { return Account::default() };
    let text = |key: &str| status[key].as_str().filter(|s| !s.is_empty()).map(str::to_string);
    Account {
        signed_in: status["loggedIn"].as_bool().unwrap_or(false),
        method: text("authMethod"),
        email: text("email"),
        plan: text("subscriptionType"),
    }
}

/// Run the CLI's login; what it prints goes to `on_event` until it ends.
/// `started` gets its input and stop handle while it runs
pub async fn sign_in(
    agent: &Agent,
    method: SignInMethod,
    started: impl FnOnce(SigningIn),
    on_event: impl Fn(SignInEvent),
) -> AppResult<()> {
    let flag = match method {
        SignInMethod::Claude => "--claudeai",
        SignInMethod::Console => "--console",
    };
    let mut command = agent.adapter(&["--cli", "auth", "login", flag], true).await?;
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| AppError::assistant(format!("starting the Claude login: {e}")))?;
    let mut stdout = child.stdout.take().expect("piped");
    let cancel = CancellationToken::new();
    started(SigningIn { stdin: child.stdin.take().expect("piped"), cancel: cancel.clone() });

    let mut buffer = [0u8; 4096];
    let mut pending = Vec::new();
    let run = async {
        loop {
            match stdout.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buffer[..n]);
                    // Whole characters only: a chunk can split one
                    let valid = match std::str::from_utf8(&pending) {
                        Ok(s) => s.len(),
                        Err(e) => e.valid_up_to(),
                    };
                    let text = strip_terminal_codes(&String::from_utf8_lossy(&pending[..valid]));
                    pending.drain(..valid);
                    if !text.is_empty() {
                        on_event(SignInEvent::Output { text });
                    }
                }
            }
        }
        child.wait().await
    };
    let status = tokio::select! {
        status = tokio::time::timeout(SIGN_IN_TIMEOUT, run) => status,
        () = cancel.cancelled() => return Err(AppError::Cancelled { message: "sign-in cancelled".into() }),
    };
    // The adapter read the old login when it started
    agent.restart().await;
    match status {
        Err(_) => Err(AppError::assistant("signing in took too long; try again")),
        Ok(Err(e)) => Err(AppError::assistant(format!("the Claude login failed: {e}"))),
        Ok(Ok(status)) if !status.success() => Err(AppError::assistant("the Claude login did not finish")),
        Ok(Ok(_)) => Ok(()),
    }
}

impl SigningIn {
    /// A line typed into the login (the code the browser shows)
    pub async fn input(&mut self, line: &str) -> AppResult<()> {
        let line = format!("{}\r", line.trim());
        self.stdin.write_all(line.as_bytes()).await.map_err(|e| AppError::io("the Claude login", e))?;
        self.stdin.flush().await.map_err(|e| AppError::io("the Claude login", e))
    }

    pub fn cancel(&self) {
        self.cancel.cancel();
    }
}

pub async fn sign_out(agent: &Agent) -> AppResult<()> {
    let mut command = agent.adapter(&["--cli", "auth", "logout"], false).await?;
    command.stdin(Stdio::null());
    let output = tokio::time::timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::assistant("signing out timed out"))?
        .map_err(|e| AppError::assistant(format!("signing out: {e}")))?;
    agent.restart().await;
    if !output.status.success() {
        return Err(AppError::assistant(format!("signing out failed: {}", String::from_utf8_lossy(&output.stderr).trim())));
    }
    Ok(())
}

/// Text without terminal control sequences (colours, cursor moves, titles)
/// and carriage returns
fn strip_terminal_codes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\u{1b}' => match chars.next() {
                // CSI: parameters, then a final byte in @..~. A cursor move
                // right stands for spaces
                Some('[') => {
                    let mut params = String::new();
                    for c in chars.by_ref() {
                        if ('@'..='~').contains(&c) {
                            if c == 'C' {
                                out.push_str(&" ".repeat(params.parse().unwrap_or(1).min(200)));
                            }
                            break;
                        }
                        params.push(c);
                    }
                }
                // Character set selection: one more character
                Some('(' | ')') => {
                    chars.next();
                }
                // OSC: up to BEL or ESC \
                Some(']') => {
                    while let Some(c) = chars.next() {
                        if c == '\u{7}' || (c == '\u{1b}' && chars.next_if_eq(&'\\').is_some()) {
                            break;
                        }
                    }
                }
                _ => {}
            },
            '\r' => {}
            c if c.is_control() && c != '\n' && c != '\t' => {}
            c => out.push(c),
        }
    }
    out
}


/// How long a login read stays good (a sign-out in a terminal shows after it)
const ACCOUNT_FRESH: std::time::Duration = std::time::Duration::from_secs(60);

impl super::Coach {
    /// Who the assistant answers as
    pub async fn account(&self) -> AppResult<Account> {
        if let Some((account, read)) = self.account.locked().clone()
            && read.elapsed() < ACCOUNT_FRESH
        {
            return Ok(account);
        }
        let account = account(&self.agent).await?;
        *self.account.locked() = Some((account.clone(), std::time::Instant::now()));
        Ok(account)
    }

    /// The login may have changed: read it again next time
    pub(super) fn forget_account(&self) {
        self.account.locked().take();
    }

    /// Sign in to Claude; the login's output streams to `on_event`. A new
    /// login stops one still running
    pub async fn sign_in(&self, method: SignInMethod, on_event: impl Fn(SignInEvent)) -> AppResult<()> {
        if let Some(earlier) = self.signing_in.lock().await.take() {
            earlier.cancel();
        }
        let result = sign_in(
            &self.agent,
            method,
            |login| {
                // The slot was just emptied and only this call fills it
                if let Ok(mut slot) = self.signing_in.try_lock() {
                    *slot = Some(login);
                }
            },
            on_event,
        )
        .await;
        self.signing_in.lock().await.take();
        self.forget_account();
        // The conversations were opened on the earlier login's adapter
        self.open.lock().await.clear();
        result
    }

    /// A line typed into the running login (the code the browser shows)
    pub async fn sign_in_input(&self, line: &str) -> AppResult<()> {
        match self.signing_in.lock().await.as_mut() {
            Some(login) => login.input(line).await,
            None => Err(AppError::invalid("no sign-in is running")),
        }
    }

    pub async fn sign_in_cancel(&self) {
        if let Some(login) = self.signing_in.lock().await.take() {
            login.cancel();
        }
    }

    pub async fn sign_out(&self) -> AppResult<()> {
        self.cancel();
        let result = sign_out(&self.agent).await;
        self.forget_account();
        self.open.lock().await.clear();
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_cli_login() {
        let account = parse_status(r#"{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.c","subscriptionType":"max"}"#);
        assert!(account.signed_in);
        assert_eq!((account.method.as_deref(), account.email.as_deref(), account.plan.as_deref()), (Some("claude.ai"), Some("a@b.c"), Some("max")));
        assert!(!parse_status(r#"{"loggedIn":false}"#).signed_in);
        assert!(!parse_status("npm error").signed_in);
    }

    /// This Mac's runtime (needs its Claude CLI, signed in, and Node): the
    /// assistant uses the login the CLI already has
    #[tokio::test]
    #[ignore]
    async fn the_mac_runtime_uses_the_existing_login() {
        let agent = Agent::new();
        let info = agent.info().await;
        println!("{info:?}");
        assert!(agent.ready() && info.problem.is_none());
        let account = account(&agent).await.unwrap();
        println!("{account:?}");
        assert!(account.signed_in);
    }

    #[test]
    fn terminal_codes_are_removed() {
        let raw = "\u{1b}]0;claude\u{7}\u{1b}[1m\u{1b}[32mOpen\u{1b}[0m https://claude.ai/oauth?x=1\r\n\u{1b}[2KPaste\u{1b}[Ccode:\u{1b}[2C\u{1b}(B";
        assert_eq!(strip_terminal_codes(raw), "Open https://claude.ai/oauth?x=1\nPaste code:  ");
    }
}
