#!/bin/bash
set -e

WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    LOGS=$(kubectl logs big-corp-app -c sidecar -n logging 2>/dev/null || true)
    if [[ -n "$LOGS" ]]; then
        echo "sidecar container logs validation successful"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "sidecar container produced no log output via 'kubectl logs -c sidecar'"
exit 1
