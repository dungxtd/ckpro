import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clusterName = () => $<HTMLInputElement>("cluster-name").value.trim();

async function refreshDocker() {
  const el = $("docker-status");
  try {
    el.textContent = `Docker: ${await invoke<string>("docker_status")}`;
    el.className = "ok";
  } catch (e) {
    el.textContent = String(e);
    el.className = "error";
  }
}

// --- cluster -------------------------------------------------------------
const log = $<HTMLPreElement>("cluster-log");
listen<{ cluster: string; line: string }>("cluster-log", ({ payload }) => {
  log.textContent += `${payload.line}\n`;
  log.scrollTop = log.scrollHeight;
});

async function clusterAction(command: string, args: Record<string, unknown>) {
  const state = $("cluster-state");
  const buttons = document.querySelectorAll<HTMLButtonElement>("#cluster-form button");
  buttons.forEach((b) => (b.disabled = true));
  log.textContent = "";
  state.textContent = "working…";
  const started = performance.now();
  try {
    await invoke(command, args);
    state.textContent = `done in ${((performance.now() - started) / 1000).toFixed(0)}s`;
  } catch (e) {
    state.textContent = String(e);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

$("cluster-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const workers = Number($<HTMLInputElement>("cluster-workers").value);
  clusterAction("create_cluster", { name: clusterName(), workers });
});
$("delete-btn").addEventListener("click", () =>
  clusterAction("delete_cluster", { name: clusterName() }),
);

// --- lab script ----------------------------------------------------------
const scriptPath = $<HTMLInputElement>("script-path");
scriptPath.value =
  "/Users/d/pwd/CK-X/facilitator/assets/exams/cka/001/scripts/validation/q1_s1_validate_namespace.sh";
$("script-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const out = $<HTMLPreElement>("script-output");
  out.textContent = "running…";
  try {
    const r = await invoke<{ exit_code: number; output: string }>("run_script", {
      cluster: clusterName(),
      path: scriptPath.value,
    });
    out.textContent = `exit ${r.exit_code} ${r.exit_code === 0 ? "PASS" : "FAIL"}\n${r.output}`;
  } catch (err) {
    out.textContent = String(err);
  }
});

// --- terminal ------------------------------------------------------------
const term = new Terminal({ fontSize: 13, cursorBlink: true });
const fit = new FitAddon();
term.loadAddon(fit);
term.open($("terminal"));
fit.fit();

let terminalId: string | null = null;
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

listen<{ id: string; data: string }>("terminal-output", ({ payload }) => {
  if (payload.id === terminalId) term.write(decode(payload.data));
});
listen<string>("terminal-exit", ({ payload }) => {
  if (payload === terminalId) {
    term.write("\r\n[session closed]\r\n");
    terminalId = null;
  }
});
term.onData((data) => {
  if (terminalId) invoke("terminal_write", { id: terminalId, data });
});
const syncSize = () => {
  fit.fit();
  if (terminalId) invoke("terminal_resize", { id: terminalId, cols: term.cols, rows: term.rows });
};
window.addEventListener("resize", syncSize);

$("term-btn").addEventListener("click", async () => {
  if (terminalId) await invoke("terminal_close", { id: terminalId });
  term.reset();
  try {
    terminalId = await invoke<string>("terminal_open", {
      container: `${clusterName()}-control-plane`,
    });
    syncSize();
    term.focus();
  } catch (e) {
    term.write(`${e}\r\n`);
  }
});

refreshDocker();
