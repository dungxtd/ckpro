#!/bin/bash
# Validate that the secure pod exists and complies with Pod Security Standards

POD_NAME="secure-pod"
NAMESPACE="api-security"

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

# Check if pod complies with baseline PSS by checking if it runs as non-root
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  echo "❌ Pod does not have runAsNonRoot set to true in its securityContext"
  exit 1
fi

# Check if pod does not allow privilege escalation
ALLOW_PRIV_ESC=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.allowPrivilegeEscalation}')
if [ "$ALLOW_PRIV_ESC" != "false" ]; then
  echo "❌ Pod allows privilege escalation (allowPrivilegeEscalation should be set to false)"
  exit 1
fi

echo "✅ Pod exists and complies with Pod Security Standards"
exit 0 