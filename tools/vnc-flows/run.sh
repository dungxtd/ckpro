#!/bin/bash
# Run the VNC flows against a desktop held open by `cargo test vnc_session
# -- --ignored`, then check what they left on the task host, in the cluster
# and on base. Screenshots: $OUT/*.png
set -u
TMP=$(python3 -c 'import tempfile; print(tempfile.gettempdir())')
SESSION=$TMP/ckdry-vnc-session.json
OUT=${OUT:-/tmp/ckdry-vnc-flows}
mkdir -p "$OUT" && cp "$SESSION" "$OUT/session.json"
DESKTOP=$(python3 -c "import json; print(json.load(open('$SESSION'))['desktop'])")
JUMPHOST=$(python3 -c "import json; print(json.load(open('$SESSION'))['jumphost'])")
CLUSTER=$(python3 -c "import json; print(json.load(open('$SESSION'))['cluster'])")

# A clean start: no results from an earlier run, a fresh desktop (Reset desktop)
docker exec "$JUMPHOST" bash -c "rm -f /tmp/vnc-*; kubectl --context $CLUSTER delete cm from-vim --ignore-not-found" >/dev/null 2>&1
docker exec "$CLUSTER-control-plane" rm -f /etc/kubernetes/manifests/vnc-static.yaml
docker exec "$DESKTOP" bash -c 'rm -f /tmp/vnc-*'
docker restart -t 2 "$DESKTOP" >/dev/null && sleep 8
rm -f "$OUT"/*.png

docker run --rm --network "container:$DESKTOP" -v "$OUT:/work" -v "$(dirname "$0")/flows.py:/flows.py:ro" \
  python:3.13-slim sh -c 'pip install -q vncdotool 2>/dev/null && python /flows.py'

pass=0; fail=0
check() { if eval "$2" >/dev/null 2>&1; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1"; fail=$((fail+1)); fi; }
on_host() { docker exec "$JUMPHOST" bash -c "$1"; }
sleep 20  # the static pod's mirror pod
EXPECTED='!@#$%^&*()_+{}|:"<>?~`-=[]\;'"'"',./ AZaz09'
check "every symbol typed exactly" '[ "$(on_host "cat /tmp/vnc-symbols.txt")" = "$EXPECTED" ]'
check "tab completion, pipe and redirect" 'on_host "grep -q ^node/ /tmp/vnc-nodes.txt && grep -q exit=0 /tmp/vnc-nodes.txt"'
check "vim ConfigMap applied" 'on_host "kubectl --context $CLUSTER get cm from-vim -o jsonpath={.data.key}" | grep -qx "va|ue{1}"'
check "Ctrl+Shift+V pastes the clipboard" 'on_host "grep -q namespace/default /tmp/vnc-paste.txt"'
check "static pod written over ssh runs" 'on_host "kubectl --context $CLUSTER get pod vnc-static-$CLUSTER-control-plane -o name"'
check "Ctrl+C stops a command" 'docker exec "$DESKTOP" grep -q after-ctrl-c /tmp/vnc-ctrlc.txt'
check "a second terminal tab" 'docker exec "$DESKTOP" grep -q tab-two /tmp/vnc-tab.txt'
check "the dock's Web Browser opens Firefox (no browser chooser)" 'docker exec "$DESKTOP" pgrep -x firefox-esr && ! docker exec "$DESKTOP" pgrep -f "[x]fce4-mime-helper"'
echo "symbols typed:    $(on_host 'cat /tmp/vnc-symbols.txt' 2>&1)"
echo "symbols expected: $EXPECTED"
echo "vim without :set paste (auto-indent, as on the exam; the Readme says to :set paste):"; on_host 'cat -A /tmp/vnc-cm2.yaml' 2>&1 | sed 's/^/  /'
echo "$pass passed, $fail failed; screenshots in $OUT"
