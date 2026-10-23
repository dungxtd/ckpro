#!/bin/bash
# Validate that the binary verification pod exists

POD_NAME="verify-bin"
NAMESPACE="binary-verify"

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

# Check if pod uses the busybox image as required
POD_IMAGE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [[ "$POD_IMAGE" != *"busybox"* ]]; then
  echo "❌ Pod '$POD_NAME' is not using the busybox image (current image: $POD_IMAGE)"
  exit 1
fi

echo "✅ Binary verification pod exists"
exit 0 