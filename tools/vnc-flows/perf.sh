#!/bin/bash
# Measure the desktop's VNC updates per workload, with the optimizations off
# (baseline) or on (optimized), toggled live on the held-open desktop
# (cargo test vnc_session). Prints, per phase: screen updates, data sent,
# changed pixels, and the desktop's CPU.
set -u
MODE=${1:-optimized}
TMP=$(python3 -c 'import tempfile; print(tempfile.gettempdir())')
OUT=${OUT:-/tmp/ckdry-vnc-perf}
mkdir -p "$OUT" && cp "$TMP/ckdry-vnc-session.json" "$OUT/session.json"
DESKTOP=$(python3 -c "import json; print(json.load(open('$OUT/session.json'))['desktop'])")
if [ "$MODE" = baseline ]; then on=true; off=false; smooth=true; else on=false; off=true; smooth=false; fi

docker restart -t 2 "$DESKTOP" >/dev/null && sleep 10
# The settings this compares, as they were before (baseline) or now
docker exec "$DESKTOP" bash -c '
  export $(tr "\0" "\n" < /proc/$(pgrep -u candidate xfdesktop)/environ | grep ^DBUS_SESSION_BUS_ADDRESS)
  xfconf-query -c xfce4-terminal -p /misc-cursor-blinks -n -t bool -s '$on'
  xfconf-query -c xfwm4 -p /general/use_compositing -n -t bool -s '$on'
  xfconf-query -c xsettings -p /Net/CursorBlink -n -t bool -s '$on'
  xfconf-query -c xsettings -p /Net/EnableAnimations -n -t bool -s '$on''
docker exec -u root "$DESKTOP" python3 -c "
import json; p='/usr/share/firefox-esr/distribution/policies.json'; d=json.load(open(p))
prefs=d['policies'].setdefault('Preferences', {})
prefs['general.smoothScroll']={'Value': $([ $smooth = true ] && echo True || echo False), 'Status': 'default'}
prefs['ui.prefersReducedMotion']={'Value': $([ $smooth = true ] && echo 0 || echo 1), 'Status': 'default'}
json.dump(d, open(p, 'w'))"

run() { docker run --rm --network "container:$DESKTOP" -v "$OUT:/work" -v "$(dirname "$0")/perf.py:/perf.py:ro" \
  python:3.13-slim sh -c "pip install -q vncdotool >/dev/null 2>&1 && python /perf.py $1" >/dev/null 2>&1; }
echo "== $MODE"
for phase in setup-terminal idle-terminal typing setup-firefox scroll idle-firefox; do
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cpu=$( (sleep 3; docker stats --no-stream --format '{{.CPUPerc}}' "$DESKTOP") & )
  run "$phase"
  case $phase in setup-*) continue ;; esac
  log=$(docker logs --since "$since" "$DESKTOP" 2>&1)
  updates=$(grep -o "Framebuffer updates: [0-9.]*[ k]*" <<<"$log" | tail -1 | sed 's/Framebuffer updates: //')
  sent=$(grep -A1 "Total:" <<<"$log" | tail -1 | grep -oE "[0-9.]+ [KMG]?i?B" | head -1)
  pixels=$(grep -o "[0-9.]* [kM]pixels in" <<<"$log" | tail -1)
  printf "   %-14s updates %-8s sent %-12s changed %-16s cpu %s\n" "$phase" "$updates" "$sent" "$pixels" "$cpu"
done
