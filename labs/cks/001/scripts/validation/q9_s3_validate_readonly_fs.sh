#!/bin/bash
# Validate that the pod uses a read-only root filesystem

POD_NAME="secure-container"
NAMESPACE="os-hardening"

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if readOnlyRootFilesystem is set to true
READONLY_ROOT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.readOnlyRootFilesystem}')
if [ "$READONLY_ROOT" != "true" ]; then
  echo "❌ Pod does not have readOnlyRootFilesystem set to true"
  exit 1
fi

# Check for required volume mounts for nginx to function with read-only filesystem
VOLUME_MOUNTS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json | jq -r '.spec.containers[0].volumeMounts[].mountPath')
if ! echo "$VOLUME_MOUNTS" | grep -q "/tmp"; then
  echo "❌ Pod is missing required volume mount for /tmp"
  exit 1
fi

if ! echo "$VOLUME_MOUNTS" | grep -q "/var/cache/nginx"; then
  echo "❌ Pod is missing required volume mount for /var/cache/nginx"
  exit 1
fi

if ! echo "$VOLUME_MOUNTS" | grep -q "/var/run"; then
  echo "❌ Pod is missing required volume mount for /var/run"
  exit 1
fi

echo "✅ Pod uses a read-only root filesystem with appropriate volume mounts"
exit 0 