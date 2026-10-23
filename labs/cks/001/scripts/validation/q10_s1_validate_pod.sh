#!/bin/bash
# Validate that pod exists with seccomp profile

POD_NAME="seccomp-pod"
NAMESPACE="seccomp-profile"

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

# Check if pod has seccomp profile applied
SECCOMP_PROFILE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.seccompProfile.type}')
if [ "$SECCOMP_PROFILE" != "RuntimeDefault" ]; then
  echo "❌ Pod does not have RuntimeDefault seccomp profile applied"
  exit 1
fi

# Check if pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
  echo "❌ Pod is not in Running state. Current status: $POD_STATUS"
  exit 1
fi

echo "✅ Pod exists with RuntimeDefault seccomp profile applied"
exit 0 