#!/bin/bash
set -e

mkdir -p /tmp/exam

# Dynamically pick a worker (non control-plane) node and taint it NoSchedule,
# so there is a real node to exclude from the "Ready" count the candidate computes.
# Uses items[2] (not items[0]/[1]) so it doesn't collide with Q2's drain-target
# node or Q7's disk=ssd node - a NoSchedule taint on either would make those
# questions' pods permanently unschedulable.
TARGET_NODE=$(kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o jsonpath='{.items[2].metadata.name}')
if [ -z "$TARGET_NODE" ]; then
  echo "No worker node found to taint"
  exit 1
fi

echo "Tainting node $TARGET_NODE with maintenance=true:NoSchedule"
kubectl taint node "$TARGET_NODE" maintenance=true:NoSchedule --overwrite

echo "Setup completed for Question 8"
