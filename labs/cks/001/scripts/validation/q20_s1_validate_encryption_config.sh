#!/bin/bash
# Validate that cilium encryption ConfigMap exists

NAMESPACE="cilium-encryption"
CONFIGMAP_NAME="cilium-encryption"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if ConfigMap exists
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$CONFIGMAP_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Get ConfigMap data
CM_DATA=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data}')
if [ -z "$CM_DATA" ]; then
  echo "❌ ConfigMap doesn't have any data"
  exit 1
fi

# Check if it has information about key rotation
if ! echo "$CM_DATA" | grep -q "rotation\|key rotation\|rotate"; then
  echo "❌ ConfigMap doesn't have information about key rotation mechanism"
  exit 1
fi

# Check if it has information about IPSec encryption
if ! echo "$CM_DATA" | grep -q "IPSec\|ipsec\|IP security"; then
  echo "❌ ConfigMap doesn't have information about IPSec encryption method"
  exit 1
fi

# Check if it has information about transparent encryption
if ! echo "$CM_DATA" | grep -q "transparent\|encryption\|wire"; then
  echo "❌ ConfigMap doesn't have information about transparent encryption approach"
  exit 1
fi

echo "✅ Cilium encryption ConfigMap exists with required information"
exit 0 