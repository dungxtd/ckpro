#!/bin/bash
set -e

SSD_NODE=$(kubectl get nodes -l disk=ssd -o jsonpath='{.items[0].metadata.name}')
if [[ -z "$SSD_NODE" ]]; then
    echo "No node labeled disk=ssd found"
    exit 1
fi

WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    PHASE=$(kubectl get pod nginx-kusc00401 -n scheduling -o jsonpath='{.status.phase}' 2>/dev/null || true)
    NODE_NAME=$(kubectl get pod nginx-kusc00401 -n scheduling -o jsonpath='{.spec.nodeName}' 2>/dev/null || true)
    if [[ "$PHASE" == "Running" && "$NODE_NAME" == "$SSD_NODE" ]]; then
        echo "Pod nginx-kusc00401 is Running on disk=ssd node $SSD_NODE"
        exit 0
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "Pod nginx-kusc00401 is not Running on the disk=ssd node (phase='$PHASE', node='$NODE_NAME', expected='$SSD_NODE')"
exit 1
