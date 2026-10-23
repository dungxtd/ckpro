#!/bin/bash
set -e

# Create namespace
kubectl create namespace scheduling --dry-run=client -o yaml | kubectl apply -f -

# Dynamically pick a worker (non control-plane) node and label it disk=ssd.
# Uses items[1] (not items[0]) so it doesn't collide with Q2's drain-target node.
TARGET_NODE=$(kubectl get nodes -l '!node-role.kubernetes.io/control-plane' -o jsonpath='{.items[1].metadata.name}')
if [ -z "$TARGET_NODE" ]; then
  echo "No worker node found to label with disk=ssd"
  exit 1
fi

echo "Labeling node $TARGET_NODE with disk=ssd"
kubectl label node "$TARGET_NODE" disk=ssd --overwrite

echo "Setup completed for Question 7"
