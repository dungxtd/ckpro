#!/bin/bash
set -e

FILE=/tmp/exam/ready-node-count.txt

if [[ ! -f "$FILE" ]]; then
    echo "File $FILE does not exist"
    exit 1
fi

ACTUAL=$(tr -d '[:space:]' < "$FILE")

# Independently compute expected count: nodes with Ready=True and no NoSchedule taint
NODES_JSON=$(kubectl get nodes -o json)
EXPECTED=$(echo "$NODES_JSON" | jq '[
  .items[]
  | select((.status.conditions[] | select(.type=="Ready") | .status) == "True")
  | select(((.spec.taints // []) | map(select(.effect=="NoSchedule")) | length) == 0)
] | length')

if [[ "$ACTUAL" != "$EXPECTED" ]]; then
    echo "Incorrect ready node count. Expected $EXPECTED, file contains '$ACTUAL'"
    exit 1
fi

echo "Ready node count validation successful ($ACTUAL)"
exit 0
