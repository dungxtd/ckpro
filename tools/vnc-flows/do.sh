#!/bin/bash
# ./do.sh ACTIONS... against the held-open desktop; screenshots in $OUT
TMP=$(python3 -c 'import tempfile; print(tempfile.gettempdir())')
OUT=${OUT:-/tmp/ckdry-vnc-do}; mkdir -p "$OUT" && cp "$TMP/ckdry-vnc-session.json" "$OUT/session.json"
DESKTOP=$(python3 -c "import json; print(json.load(open('$OUT/session.json'))['desktop'])")
docker image inspect ckdry-vnc-driver >/dev/null 2>&1 || printf 'FROM python:3.13-slim\nRUN pip install -q vncdotool\n' | docker build -q -t ckdry-vnc-driver - >/dev/null
docker run --rm --network "container:$DESKTOP" -v "$OUT:/work" -v "$(dirname "$0")/do.py:/do.py:ro" ckdry-vnc-driver python /do.py "$@" 2>&1 | grep -vE "Deprecation|encryptor ="
