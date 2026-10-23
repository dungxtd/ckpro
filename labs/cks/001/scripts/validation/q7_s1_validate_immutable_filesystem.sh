#!/bin/bash
# Validate that the pod has an immutable filesystem

POD_NAME="secure-pod"
NAMESPACE="pod-security"

# Check if the pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the pod has readOnlyRootFilesystem set to true
READONLY_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.readOnlyRootFilesystem}')
if [ "$READONLY_ROOT" != "true" ]; then
  echo "❌ Pod does not have readOnlyRootFilesystem set to true"
  exit 1
fi

echo "✅ Pod has immutable filesystem (readOnlyRootFilesystem: true)"
exit 0 