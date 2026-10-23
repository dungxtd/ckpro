#!/bin/bash
# Validate that the pod has the correct volume mount

POD_NAME="verify-bin"
NAMESPACE="binary-verify"
EXPECTED_HOST_PATH="/usr/bin"
EXPECTED_MOUNT_PATH="/host-bin"

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod has a volume that mounts the host's /usr/bin directory
VOLUME_NAME=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.volumes[*].name}')
HOST_PATH=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.volumes[?(@.hostPath)].hostPath.path}')
if [[ "$HOST_PATH" != *"$EXPECTED_HOST_PATH"* ]]; then
  echo "❌ Pod does not mount the hostPath $EXPECTED_HOST_PATH"
  exit 1
fi

# Check if the volume is mounted at the correct path
MOUNT_PATH=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].volumeMounts[0].mountPath}')
if [ "$MOUNT_PATH" != "$EXPECTED_MOUNT_PATH" ]; then
  echo "❌ Volume is not mounted at the correct path ($MOUNT_PATH instead of $EXPECTED_MOUNT_PATH)"
  exit 1
fi

# Check if the volume is mounted as read-only
READONLY=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].volumeMounts[0].readOnly}')
if [ "$READONLY" != "true" ]; then
  echo "❌ Volume is not mounted as read-only"
  exit 1
fi

echo "✅ Pod has the correct volume mount configuration"
exit 0 