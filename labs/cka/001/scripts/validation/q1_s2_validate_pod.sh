#!/bin/bash
# Validate if nginx pod exists and is running in app-team1 namespace

NAMESPACE="app-team1"
POD_NAME="nginx-pod"
EXPECTED_IMAGE="nginx:1.19"

# Check if pod exists
if ! kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

# Check if pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
    echo "❌ Pod '$POD_NAME' exists but is not running (status: $POD_STATUS)"
    exit 1
fi

# Check if correct image is used
POD_IMAGE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [ "$POD_IMAGE" != "$EXPECTED_IMAGE" ]; then
    echo "❌ Pod '$POD_NAME' is using incorrect image: $POD_IMAGE (expected: $EXPECTED_IMAGE)"
    exit 1
fi

echo "✅ Pod '$POD_NAME' exists, is running, and using correct image in namespace '$NAMESPACE'"
exit 0 