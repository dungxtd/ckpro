#!/bin/bash
# Validate that pod has correct security context

POD_NAME="secure-image-pod"
NAMESPACE="image-security"
IMAGE="nginx:alpine"
USER_ID=101

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

# Check if pod is configured to run as non-root user
RUN_AS_NON_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.runAsNonRoot}')
if [ "$RUN_AS_NON_ROOT" != "true" ]; then
  # Check alternative way of specifying non-root
  RUN_AS_USER=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.securityContext.runAsUser}')
  if [ "$RUN_AS_USER" != "$USER_ID" ]; then
    echo "❌ Pod is not configured to run as non-root user with ID $USER_ID"
    exit 1
  fi
fi

echo "✅ Pod has correct security context"
exit 0 