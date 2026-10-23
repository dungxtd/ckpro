#!/bin/bash
# Validate that the pod has proper capability restrictions

POD_NAME="secure-pod"
NAMESPACE="pod-security"
REQUIRED_DROP_CAPS=("ALL")

# Check if the pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if the pod has dropped ALL capabilities
DROP_CAPS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.capabilities.drop}')
for cap in "${REQUIRED_DROP_CAPS[@]}"; do
  if [[ "$DROP_CAPS" != *"$cap"* ]]; then
    echo "❌ Pod has not dropped required capability: $cap"
    exit 1
  fi
done

# Check if the pod has any added capabilities
ADD_CAPS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.capabilities.add}')
if [ -n "$ADD_CAPS" ] && [ "$ADD_CAPS" != "[]" ]; then
  echo "❌ Pod should not have any added capabilities, but found: $ADD_CAPS"
  exit 1
fi

echo "✅ Pod has proper capability restrictions (dropped ALL, no added capabilities)"
exit 0 