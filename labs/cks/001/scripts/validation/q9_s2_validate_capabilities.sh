#!/bin/bash
# Validate that the pod has correct capabilities configuration

POD_NAME="secure-container"
NAMESPACE="os-hardening"
REQUIRED_DROP_CAPS=("ALL")
REQUIRED_ADD_CAPS=("NET_BIND_SERVICE")

# Check if pod exists
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

# Check if the pod has added the required capabilities
ADD_CAPS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.capabilities.add}')
for cap in "${REQUIRED_ADD_CAPS[@]}"; do
  if [[ "$ADD_CAPS" != *"$cap"* ]]; then
    echo "❌ Pod has not added required capability: $cap"
    exit 1
  fi
done

echo "✅ Pod has correct capabilities configuration (dropped ALL, added NET_BIND_SERVICE)"
exit 0 