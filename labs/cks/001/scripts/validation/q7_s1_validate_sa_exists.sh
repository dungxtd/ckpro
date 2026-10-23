#!/bin/bash
# Validate that ServiceAccount exists

SA_NAME="minimal-sa"
NAMESPACE="service-account-caution"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if the service account exists
kubectl get serviceaccount $SA_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ServiceAccount '$SA_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

echo "✅ ServiceAccount exists"
exit 0 