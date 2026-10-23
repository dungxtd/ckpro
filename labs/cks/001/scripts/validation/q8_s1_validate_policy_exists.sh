#!/bin/bash
# Validate that the NetworkPolicy exists

POLICY_NAME="api-server-policy"
NAMESPACE="api-restrict"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if NetworkPolicy exists
kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

echo "✅ NetworkPolicy '$POLICY_NAME' exists in namespace '$NAMESPACE'"
exit 0 