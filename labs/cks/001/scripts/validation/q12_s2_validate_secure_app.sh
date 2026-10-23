#!/bin/bash
# Validate that pod mounts secrets as files

POD_NAME="secure-app"
NAMESPACE="secrets-management"
SECRET_NAME="db-creds"
MOUNT_PATH="/etc/db-creds"

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

# Check if pod has volume for secret
SECRET_VOLUME=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json | grep -c "$SECRET_NAME")
if [ "$SECRET_VOLUME" -eq 0 ]; then
  echo "❌ Pod doesn't have volume for secret '$SECRET_NAME'"
  exit 1
fi

# Check if volume is mounted at correct path
VOLUME_MOUNT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].volumeMounts[*].mountPath}')
if [[ "$VOLUME_MOUNT" != *"$MOUNT_PATH"* ]]; then
  echo "❌ Secret not mounted at correct path. Expected: $MOUNT_PATH"
  exit 1
fi

# Verify that files exist in the container
if ! kubectl exec $POD_NAME -n $NAMESPACE -- ls $MOUNT_PATH/username &> /dev/null; then
  echo "❌ Username file not found in container at $MOUNT_PATH/username"
  exit 1
fi

if ! kubectl exec $POD_NAME -n $NAMESPACE -- ls $MOUNT_PATH/password &> /dev/null; then
  echo "❌ Password file not found in container at $MOUNT_PATH/password"
  exit 1
fi

echo "✅ Pod mounts secrets as files"
exit 0 