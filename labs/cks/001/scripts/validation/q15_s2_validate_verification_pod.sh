#!/bin/bash
# Validate that verification pod and script exist

POD_NAME="verification-pod"
NAMESPACE="supply-chain"
SCRIPT_CM="verify-script"
SCRIPT_KEY="verify.sh"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if verification pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ] && [ "$POD_STATUS" != "Succeeded" ]; then
  echo "❌ Pod is not running or completed successfully. Current status: $POD_STATUS"
  exit 1
fi

# Check if pod uses the correct image (busybox)
POD_IMAGE=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [[ "$POD_IMAGE" != *"busybox"* ]]; then
  echo "❌ Pod is not using the busybox image. Got: $POD_IMAGE"
  exit 1
fi

# Check if verification script ConfigMap exists
kubectl get configmap $SCRIPT_CM -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$SCRIPT_CM' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if script exists in ConfigMap
SCRIPT=$(kubectl get configmap $SCRIPT_CM -n $NAMESPACE -o jsonpath="{.data['$SCRIPT_KEY']}")
if [ -z "$SCRIPT" ]; then
  echo "❌ Script '$SCRIPT_KEY' not found in ConfigMap '$SCRIPT_CM'"
  exit 1
fi

# Check if script is mounted in the pod
VOLUME_MOUNTS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json)
if ! echo "$VOLUME_MOUNTS" | grep -q "$SCRIPT_CM"; then
  echo "❌ Script ConfigMap not mounted in the pod"
  exit 1
fi

echo "✅ Verification pod and script exist"
exit 0 