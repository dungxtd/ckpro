#!/bin/bash
set -e

TARGET_NODE=$(kubectl get nodes -l drain-target=true -o jsonpath='{.items[0].metadata.name}')
if [[ -z "$TARGET_NODE" ]]; then
    echo "Could not find node labeled drain-target=true"
    exit 1
fi

kubectl get deployment drain-target -n node-ops || {
    echo "Deployment drain-target not found in namespace node-ops"
    exit 1
}

WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    PODS=$(kubectl get pods -n node-ops -l app=drain-target -o json)
    TOTAL=$(echo "$PODS" | jq '.items | length')
    ON_OTHER_NODE=$(echo "$PODS" | jq --arg n "$TARGET_NODE" '[.items[] | select(.spec.nodeName != $n and .spec.nodeName != null)] | length')
    RUNNING=$(echo "$PODS" | jq '[.items[] | select(.status.phase == "Running")] | length')

    if [[ "$TOTAL" -gt 0 && "$ON_OTHER_NODE" -eq "$TOTAL" && "$RUNNING" -eq "$TOTAL" ]]; then
        echo "All drain-target pods rescheduled off $TARGET_NODE and Running"
        exit 0
    fi

    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

echo "drain-target pods are not all rescheduled off $TARGET_NODE and Running"
exit 1
