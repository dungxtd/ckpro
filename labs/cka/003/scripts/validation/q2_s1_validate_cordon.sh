#!/bin/bash
set -e

TARGET_NODE=$(kubectl get nodes -l drain-target=true -o jsonpath='{.items[0].metadata.name}')
if [[ -z "$TARGET_NODE" ]]; then
    echo "Could not find node labeled drain-target=true"
    exit 1
fi

UNSCHEDULABLE=$(kubectl get node "$TARGET_NODE" -o jsonpath='{.spec.unschedulable}')
if [[ "$UNSCHEDULABLE" != "true" ]]; then
    echo "Node $TARGET_NODE is not cordoned (spec.unschedulable=$UNSCHEDULABLE)"
    exit 1
fi

echo "Node $TARGET_NODE is correctly cordoned"
exit 0
