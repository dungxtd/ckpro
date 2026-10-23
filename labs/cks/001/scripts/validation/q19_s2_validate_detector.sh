#!/bin/bash
# Validate that detector pod exists

NAMESPACE="malicious-detection"
POD_NAME="detector"
IMAGE="busybox"

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
if [[ "$POD_IMAGE" != *"$IMAGE"* ]]; then
  echo "❌ Pod is not using the correct image. Expected: $IMAGE, Got: $POD_IMAGE"
  exit 1
fi

# Check if the pod has a command that runs periodically
POD_SPEC=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json)
if ! echo "$POD_SPEC" | grep -q "sleep\|loop\|while\|cron\|every"; then
  echo "❌ Pod doesn't appear to be running detection rules periodically"
  exit 1
fi

# Check if pod mounts the threat detection rules
if ! echo "$POD_SPEC" | grep -q "threat-detection\|configMap"; then
  echo "❌ Pod doesn't appear to mount the threat detection rules ConfigMap"
  exit 1
fi

echo "✅ Detector pod exists and is properly configured"
exit 0 