#!/bin/bash
# Validate that the NetworkPolicy exists

POLICY_NAME="secure-backend"
NAMESPACE="network-security"

kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -eq 0 ]; then
  echo "✅ NetworkPolicy '$POLICY_NAME' exists in namespace '$NAMESPACE'"
  exit 0
else
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi 