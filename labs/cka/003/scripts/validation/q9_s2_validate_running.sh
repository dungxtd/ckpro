#!/bin/bash
set -e

WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    PHASE=$(kubectl get pod kucc8 -n multi-container -o jsonpath='{.status.phase}' 2>/dev/null || true)
    if [[ "$PHASE" == "Running" ]]; then
        echo "Pod kucc8 is Running"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "Pod kucc8 is not Running (phase='$PHASE')"
exit 1
