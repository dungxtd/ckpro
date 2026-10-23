#!/bin/bash
# Validate that ServiceAccount has automounting disabled

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

# Check if automountServiceAccountToken is set to false
AUTOMOUNT=$(kubectl get serviceaccount $SA_NAME -n $NAMESPACE -o jsonpath='{.automountServiceAccountToken}')
if [ "$AUTOMOUNT" != "false" ]; then
  echo "❌ ServiceAccount automountServiceAccountToken is not set to false"
  exit 1
fi

echo "✅ ServiceAccount has automounting disabled"
exit 0 