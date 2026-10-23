#!/bin/bash
# Validate that compliant pod exists

POD_NAME="compliant-pod"
NAMESPACE="pod-security"

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

# Check if pod is running (which means it complies with PSS)
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
  echo "❌ Pod is not in Running state. Current state: $POD_STATUS"
  exit 1
fi

# Verify basic PSS baseline compliance
# Check if runAsNonRoot is set
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  echo "❌ Pod is not compliant with baseline PSS: runAsNonRoot not set to true"
  exit 1
fi

echo "✅ Compliant pod exists"
exit 0 