#!/bin/bash
# Validate that container has proper immutability settings

POD_NAME="immutable-app"
NAMESPACE="immutable"

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

# Check for readOnlyRootFilesystem
READONLY_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.readOnlyRootFilesystem}')
if [ "$READONLY_ROOT" != "true" ]; then
  echo "❌ Pod does not have readOnlyRootFilesystem set to true"
  exit 1
fi

# Check for runAsNonRoot
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  echo "❌ Pod does not have runAsNonRoot set to true"
  exit 1
fi

# Check for dropped capabilities
DROP_CAPS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.capabilities.drop}')
if [[ "$DROP_CAPS" != *"ALL"* ]]; then
  echo "❌ Pod has not dropped ALL capabilities"
  exit 1
fi

# Check for emptyDir temp volume (rather than writable filesystem)
EMPTY_DIR=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json | grep -c "emptyDir")
if [ "$EMPTY_DIR" -eq 0 ]; then
  echo "❌ Pod does not use emptyDir volume for temporary storage"
  exit 1
fi

echo "✅ Container has proper immutability settings"
exit 0 