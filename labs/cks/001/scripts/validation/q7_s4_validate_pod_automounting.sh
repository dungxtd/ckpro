#!/bin/bash
# Validate that pod automounting is explicitly disabled

DEPLOYMENT_NAME="secure-app"
NAMESPACE="service-account-caution"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if the deployment exists
kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Deployment '$DEPLOYMENT_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if automounting is explicitly disabled in pod spec
POD_AUTOMOUNT=$(kubectl get deployment $DEPLOYMENT_NAME -n $NAMESPACE -o jsonpath='{.spec.template.spec.automountServiceAccountToken}')
if [ "$POD_AUTOMOUNT" != "false" ]; then
  echo "❌ Pod spec does not have automountServiceAccountToken explicitly set to false"
  exit 1
fi

echo "✅ Pod automounting is explicitly disabled"
exit 0 