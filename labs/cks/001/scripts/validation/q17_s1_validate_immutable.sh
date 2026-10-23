#!/bin/bash
# Validate that immutable container exists

NAMESPACE="runtime-security"
POD_NAME="immutable-container"
IMAGE="nginx:alpine"

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
  echo "❌ Pod is not running. Current status: $POD_STATUS"
  exit 1
fi

# Check if pod uses the correct image
POD_IMAGE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [[ "$POD_IMAGE" != "$IMAGE" ]]; then
  echo "❌ Pod is not using the correct image. Expected: $IMAGE, Got: $POD_IMAGE"
  exit 1
fi

# Check if readOnlyRootFilesystem is set to true
READONLY_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.readOnlyRootFilesystem}')
if [ "$READONLY_ROOT" != "true" ]; then
  echo "❌ Pod does not have readOnlyRootFilesystem set to true"
  exit 1
fi

# Try to write to the filesystem to confirm it's read-only
TEST_CMD="touch /test-readonly"
TEST_RESULT=$(kubectl exec $POD_NAME -n $NAMESPACE -- sh -c "$TEST_CMD" 2>&1)
if ! echo "$TEST_RESULT" | grep -q "Read-only\|cannot create"; then
  echo "❌ File system is not actually read-only"
  exit 1
fi

echo "✅ Immutable container exists with read-only filesystem"
exit 0 