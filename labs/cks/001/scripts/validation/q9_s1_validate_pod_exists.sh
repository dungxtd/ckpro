#!/bin/bash
# Validate that pod exists

POD_NAME="secure-container"
NAMESPACE="os-hardening"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
  echo "❌ Pod '$POD_NAME' is not in Running state (current state: $POD_STATUS)"
  exit 1
fi

echo "✅ Pod '$POD_NAME' exists and is running in namespace '$NAMESPACE'"
exit 0 