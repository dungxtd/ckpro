#!/bin/bash

# Validate if the pod 'logging-pod' is running in the 'troubleshooting' namespace
POD_NAME="secure-pod"
NAMESPACE="workloads"

# Check if the pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')

if [ "$POD_STATUS" = "Running" ]; then
    echo "Success: Pod '$POD_NAME' is running in namespace '$NAMESPACE'"
    exit 0
else
    echo "Error: Pod '$POD_NAME' is not running in namespace '$NAMESPACE'"
    exit 1
fi
