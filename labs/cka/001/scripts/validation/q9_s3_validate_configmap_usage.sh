#!/bin/bash
# Validate ConfigMap usage and mounting

POD_NAME="config-pod"
CONFIGMAP_NAME="app-config"

# Check if pod exists and is running
if ! kubectl get pod $POD_NAME &> /dev/null; then
    echo "❌ Pod '$POD_NAME' not found"
    exit 1
fi

POD_STATUS=$(kubectl get pod $POD_NAME -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
    echo "❌ Pod '$POD_NAME' is not running"
    exit 1
fi

# Check if ConfigMap exists
if ! kubectl get configmap $CONFIGMAP_NAME &> /dev/null; then
    echo "❌ ConfigMap '$CONFIGMAP_NAME' not found"
    exit 1
fi

# Check if ConfigMap has correct data
CONFIG_VALUE=$(kubectl get configmap $CONFIGMAP_NAME -o jsonpath='{.data.APP_COLOR}')
if [ "$CONFIG_VALUE" != "blue" ]; then
    echo "❌ ConfigMap has incorrect value: $CONFIG_VALUE (expected: blue)"
    exit 1
fi

# Check if volume is properly mounted
VOLUME_MOUNT=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.volumes[?(@.name=="config-volume")].configMap.name}')
if [ "$VOLUME_MOUNT" != "$CONFIGMAP_NAME" ]; then
    echo "❌ ConfigMap is not properly mounted as volume"
    exit 1
fi

# Check if volume is mounted at correct path
MOUNT_PATH=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].volumeMounts[?(@.name=="config-volume")].mountPath}')
if [ "$MOUNT_PATH" != "/etc/config" ]; then
    echo "❌ ConfigMap is mounted at incorrect path: $MOUNT_PATH"
    exit 1
fi

# Verify ConfigMap content in pod
POD_CONFIG_VALUE=$(kubectl exec $POD_NAME -- cat /etc/config/APP_COLOR)
if [ "$POD_CONFIG_VALUE" != "blue" ]; then
    echo "❌ ConfigMap value not correctly mounted in pod"
    exit 1
fi

# Check if pod can read the mounted ConfigMap
if ! kubectl exec $POD_NAME -- ls -l /etc/config/APP_COLOR &> /dev/null; then
    echo "❌ Pod cannot access mounted ConfigMap file"
    exit 1
fi

echo "✅ ConfigMap is correctly configured and mounted"
exit 0 