#!/bin/bash
# Validate that container has correct volume mounts

POD_NAME="immutable-app"
NAMESPACE="immutable"
TMP_VOLUME_NAME="tmp-data"
TMP_MOUNT_PATH="/tmp"

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

# Check if the pod has the expected volume
VOLUME_NAMES=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.volumes[*].name}')
if [[ "$VOLUME_NAMES" != *"$TMP_VOLUME_NAME"* ]]; then
  echo "❌ Pod doesn't have the expected volume '$TMP_VOLUME_NAME'"
  exit 1
fi

# Check if the volume is an emptyDir
VOLUME_TYPE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.volumes[?(@.name=="'$TMP_VOLUME_NAME'")].emptyDir}')
if [ -z "$VOLUME_TYPE" ]; then
  echo "❌ Volume '$TMP_VOLUME_NAME' is not an emptyDir"
  exit 1
fi

# Check if the volume is mounted at the correct path
MOUNT_PATH=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].volumeMounts[?(@.name=="'$TMP_VOLUME_NAME'")].mountPath}')
if [ "$MOUNT_PATH" != "$TMP_MOUNT_PATH" ]; then
  echo "❌ Volume is not mounted at the correct path. Expected: $TMP_MOUNT_PATH, Got: $MOUNT_PATH"
  exit 1
fi

# Check if the app is actually using the path for temporary files
# This test is best-effort and assumes the app is writing to /tmp
echo "Testing if the app uses the volume for temporary files..."
TMP_FILES=$(kubectl exec $POD_NAME -n $NAMESPACE -- ls -la /tmp 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "✓ Container can access the temporary volume"
else
  echo "⚠️ Could not verify if container is using the temporary volume"
fi

echo "✅ Container has correct volume mounts"
exit 0 