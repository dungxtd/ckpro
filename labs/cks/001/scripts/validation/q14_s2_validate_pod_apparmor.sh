#!/bin/bash
# Validate that pod uses AppArmor profile

POD_NAME="apparmor-pod"
NAMESPACE="apparmor"
PROFILE_NAME="k8s-restricted"

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
  echo "❌ Pod '$POD_NAME' is not in Running state (current state: $POD_STATUS)"
  exit 1
fi

# Check if pod has the AppArmor annotation
APPARMOR_ANNOTATION=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.metadata.annotations.container\.apparmor\.security\.beta\.kubernetes\.io/apparmor-container}')
if [ -z "$APPARMOR_ANNOTATION" ]; then
  echo "❌ Pod doesn't have AppArmor annotation"
  exit 1
fi

# Check if the annotation references the correct profile
if [[ "$APPARMOR_ANNOTATION" != *"$PROFILE_NAME"* ]] && [[ "$APPARMOR_ANNOTATION" != "localhost/$PROFILE_NAME" ]]; then
  echo "❌ Pod uses incorrect AppArmor profile. Expected: $PROFILE_NAME, Got: $APPARMOR_ANNOTATION"
  exit 1
fi

echo "✅ Pod uses the correct AppArmor profile"
exit 0 