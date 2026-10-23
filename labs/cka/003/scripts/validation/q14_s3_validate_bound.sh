#!/bin/bash
set -e

# rancher.io/local-path binds dynamically, but only once a consuming pod exists
# (WaitForFirstConsumer-like behavior); poll for Bound status.
WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    STATUS=$(kubectl get pvc pv-volume -n storage-pvc -o jsonpath='{.status.phase}' 2>/dev/null || true)
    if [[ "$STATUS" == "Bound" ]]; then
        echo "PVC pv-volume is Bound"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "PVC pv-volume is not Bound (status='$STATUS')"
exit 1
