#!/bin/bash
# Validate pod status and readiness

NAMESPACE="app-team1"
POD_NAME="nginx-pod"

# Check if pod is ready
READY=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].ready}')
if [ "$READY" != "true" ]; then
    echo "❌ Pod '$POD_NAME' is not ready"
    exit 1
fi

# Check if pod has restarted
RESTARTS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].restartCount}')
if [ "$RESTARTS" != "0" ]; then
    echo "❌ Pod '$POD_NAME' has restarted $RESTARTS times"
    exit 1
fi

# Check if pod is running on a valid node
NODE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.nodeName}')
if [ -z "$NODE" ]; then
    echo "❌ Pod '$POD_NAME' is not assigned to any node"
    exit 1
fi

# Check if pod has the correct labels
LABELS=$(kubectl get pod $POD_NAME -n $NAMESPACE --show-labels)
if [[ ! "$LABELS" =~ "run=nginx-pod" ]]; then
    echo "❌ Pod '$POD_NAME' missing expected labels"
    exit 1
fi

echo "✅ Pod '$POD_NAME' has correct status and configuration"
exit 0 