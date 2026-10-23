#!/bin/bash
set -e

FILE=/tmp/exam/top-cpu-pod.txt

if [[ ! -f "$FILE" ]]; then
    echo "File $FILE does not exist"
    exit 1
fi

# metrics-server can take 30-60s to populate after pod start, retry with backoff.
# Compute the max ourselves rather than trust the direction of `--sort-by`, since
# that flag's ordering isn't consistent across kubectl versions.
WAIT_COUNT=0
EXPECTED=""
while [ $WAIT_COUNT -lt 90 ]; do
    TOP_OUTPUT=$(kubectl top pod -n monitoring -l name=overloaded-cpu --no-headers 2>/dev/null || true)
    if [[ -n "$TOP_OUTPUT" ]]; then
        EXPECTED=$(echo "$TOP_OUTPUT" | awk '{
            cpu=$2; gsub(/m$/, "", cpu);
            if (cpu+0 > max) { max = cpu+0; name = $1 }
        } END { print name }')
        if [[ -n "$EXPECTED" ]]; then
            break
        fi
    fi
    WAIT_COUNT=$((WAIT_COUNT+10))
    sleep 10
done

if [[ -z "$EXPECTED" ]]; then
    echo "Could not obtain 'kubectl top pod' metrics for namespace monitoring"
    exit 1
fi

ACTUAL=$(tr -d '[:space:]' < "$FILE")
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
    echo "Incorrect top CPU pod. Expected '$EXPECTED', file contains '$ACTUAL'"
    exit 1
fi

echo "top-cpu-pod.txt validation successful ($ACTUAL)"
exit 0
