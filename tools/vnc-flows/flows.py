"""Drive the exam desktop over VNC (RFB) like a candidate: the keys and the
mouse go the way noVNC sends them. Each flow leaves results the checks in
run.sh read, and screenshots in /work."""
import json
import time

from vncdotool import api

s = json.load(open("/work/session.json"))
host, cluster = s["host"], s["cluster"]
c = api.connect("127.0.0.1::5901", password=s["password"])

# Every printable ASCII character, typed into a file and compared exactly
SYMBOLS = "!@#$%^&*()_+{}|:\"<>?~`-=[]\\;',./ AZaz09"


def shot(name):
    c.captureScreen(f"/work/{name}.png")


def type_text(text):
    # One key event per character, its keysym (the code point for ASCII),
    # as noVNC sends them; the X server picks the key and the Shift
    # (keyPress of a single character sends exactly its keysym)
    for ch in text:
        c.keyPress(ch)


def line(text):
    type_text(text)
    c.keyPress("enter")


def double_click(x, y):
    c.mouseMove(x, y)
    c.mousePress(1)
    time.sleep(0.12)
    c.mousePress(1)


def step(name):
    print(f"-- {name}", flush=True)


step("open the terminal from its desktop icon")
double_click(60, 67)
time.sleep(3)
shot("01-terminal")

step("ssh to the task host")
line(f"ssh {host}")
time.sleep(2)
shot("02-ssh")

step("type every symbol")
line("cat > /tmp/vnc-symbols.txt")
line(SYMBOLS)
c.keyPress("ctrl-d")

step("tab completion, pipes, redirects")
type_text("kubectl get no")
c.keyPress("tab")
time.sleep(0.5)
line(' -o name | sort > /tmp/vnc-nodes.txt; echo "exit=$?" >> /tmp/vnc-nodes.txt')

step("vim: a ConfigMap, applied")
line("vim /tmp/vnc-cm.yaml")
time.sleep(1)
line(":set paste")
c.keyPress("i")
for text in ["apiVersion: v1", "kind: ConfigMap", "metadata:", "  name: from-vim", "data:", '  key: "va|ue{1}"']:
    line(text)
c.keyPress("esc")
line(":wq")
time.sleep(0.5)
line("k apply -f /tmp/vnc-cm.yaml > /tmp/vnc-apply.txt 2>&1")

step("vim without :set paste (what a candidate may do)")
line("vim /tmp/vnc-cm2.yaml")
time.sleep(1)
c.keyPress("i")
for text in ["metadata:", "  name: x", "  labels:", "    a: b"]:
    line(text)
c.keyPress("esc")
line(":wq")

step("paste from the clipboard with Ctrl+Shift+V")
c.paste("kubectl get ns -o name > /tmp/vnc-paste.txt")
time.sleep(0.5)
c.keyPress("ctrl-shift-v")
time.sleep(1)  # the paste arrives after the terminal asks for the clipboard
c.keyPress("enter")
time.sleep(1)
shot("03-host-work")

step("back to base, a static pod on the control plane")
line("exit")
time.sleep(1)
line(f"ssh {cluster}-control-plane")
time.sleep(2)
line("cat > /etc/kubernetes/manifests/vnc-static.yaml <<'EOF'")
for text in [
    "apiVersion: v1",
    "kind: Pod",
    "metadata:",
    "  name: vnc-static",
    "spec:",
    "  containers:",
    "  - name: web",
    "    image: nginx:alpine",
    "EOF",
]:
    line(text)
line("exit")
time.sleep(1)

step("Ctrl+C stops a command")
line("sleep 300")
time.sleep(1)
c.keyPress("ctrl-c")
line("echo after-ctrl-c > /tmp/vnc-ctrlc.txt")

step("a second terminal tab")
c.keyPress("ctrl-shift-t")
time.sleep(1.5)
line("echo tab-two > /tmp/vnc-tab.txt")
time.sleep(0.5)
shot("04-base-tabs")

step("Firefox from the dock, search the docs")
c.mouseMove(664, 776)
c.mousePress(1)
time.sleep(10)
c.keyPress("ctrl-l")
line("https://kubernetes.io/search/?q=static%20pod")
time.sleep(10)
shot("05-firefox-search")

step("a site outside the allowed docs")
c.keyPress("ctrl-l")
line("https://github.com/kubernetes/kubernetes")
time.sleep(5)
shot("06-firefox-blocked")

c.disconnect()
print("-- done", flush=True)
