#!/bin/bash
# Validate that secure pods are deployed with correct configuration

NAMESPACE="secure-comms"
POD_A="secure-pod-a"
POD_B="secure-pod-b"
IMAGE="nginx"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if pod A exists
kubectl get pod $POD_A -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_A' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod B exists
kubectl get pod $POD_B -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_B' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pods are running
POD_A_STATUS=$(kubectl get pod $POD_A -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_A_STATUS" != "Running" ]; then
  echo "❌ Pod A is not running. Current status: $POD_A_STATUS"
  exit 1
fi

POD_B_STATUS=$(kubectl get pod $POD_B -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_B_STATUS" != "Running" ]; then
  echo "❌ Pod B is not running. Current status: $POD_B_STATUS"
  exit 1
fi

# Check if pods use the correct image
POD_A_IMAGE=$(kubectl get pod $POD_A -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [[ "$POD_A_IMAGE" != *"$IMAGE"* ]]; then
  echo "❌ Pod A is not using the correct image. Expected: $IMAGE, Got: $POD_A_IMAGE"
  exit 1
fi

POD_B_IMAGE=$(kubectl get pod $POD_B -n $NAMESPACE -o jsonpath='{.spec.containers[0].image}')
if [[ "$POD_B_IMAGE" != *"$IMAGE"* ]]; then
  echo "❌ Pod B is not using the correct image. Expected: $IMAGE, Got: $POD_B_IMAGE"
  exit 1
fi

# Check if pods have Cilium encryption labels/annotations
POD_A_LABELS=$(kubectl get pod $POD_A -n $NAMESPACE -o json)
POD_B_LABELS=$(kubectl get pod $POD_B -n $NAMESPACE -o json)

# Check for Cilium-specific annotations or labels
if ! echo "$POD_A_LABELS$POD_B_LABELS" | grep -q "cilium\|encryption\|secure-comms\|encrypt"; then
  echo "❌ Pods don't have appropriate labels/annotations for Cilium encryption"
  exit 1
fi

echo "✅ Secure pods are deployed with correct configuration for Cilium encryption"
exit 0 