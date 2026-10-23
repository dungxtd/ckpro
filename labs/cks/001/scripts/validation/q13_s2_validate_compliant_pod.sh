#!/bin/bash
# Validate that pod complies with Pod Security Standards

POD_NAME="secure-app"
NAMESPACE="secure-ns"

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

# Check if pod is running (which means it passed PSS checks)
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
  echo "❌ Pod '$POD_NAME' is not in Running state (current state: $POD_STATUS)"
  exit 1
fi

# Verify the pod complies with baseline PSS by checking requirements:
# 1. Check if runAsNonRoot is set to true
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  echo "❌ Pod does not have runAsNonRoot set to true in its securityContext"
  exit 1
fi

# 2. Check if privileges are not escalated
ALLOW_PRIV_ESC=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.allowPrivilegeEscalation}')
if [ "$ALLOW_PRIV_ESC" != "false" ]; then
  echo "❌ Pod allows privilege escalation"
  exit 1
fi

# 3. Check if hostPath volumes are not used
HOST_PATH_VOLUMES=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json | grep -c "hostPath")
if [ "$HOST_PATH_VOLUMES" -gt 0 ]; then
  echo "❌ Pod uses hostPath volumes which is not allowed in baseline PSS"
  exit 1
fi

# 4. Check if privileged container is not used
PRIVILEGED=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.privileged}')
if [ "$PRIVILEGED" == "true" ]; then
  echo "❌ Pod uses privileged container which is not allowed in baseline PSS"
  exit 1
fi

echo "✅ Pod complies with Pod Security Standards"
exit 0 