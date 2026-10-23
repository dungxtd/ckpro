#!/bin/bash
# Validate that the pod runs as non-root user

POD_NAME="secure-pod"
NAMESPACE="pod-security"

# Check if the pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the pod has runAsNonRoot set to true
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  echo "❌ Pod does not have runAsNonRoot set to true"
  exit 1
fi

# Check if the pod has a specific runAsUser set
RUN_AS_USER=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.runAsUser}')
if [ -z "$RUN_AS_USER" ]; then
  echo "❌ Pod does not have runAsUser specified"
  exit 1
fi

# Make sure runAsUser is greater than 1000
if [ "$RUN_AS_USER" -lt 1000 ]; then
  echo "❌ Pod runAsUser ($RUN_AS_USER) is less than 1000"
  exit 1
fi

echo "✅ Pod runs as non-root user (runAsNonRoot: true, runAsUser: $RUN_AS_USER)"
exit 0 