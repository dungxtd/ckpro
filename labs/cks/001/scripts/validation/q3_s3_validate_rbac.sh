#!/bin/bash
# Validate that the Role and RoleBinding exist and have correct configurations

ROLE_NAME="pss-viewer-role"
ROLEBINDING_NAME="pss-viewer-binding"
SERVICE_ACCOUNT="pss-viewer"
NAMESPACE="api-security"

# Check if Role exists
kubectl get role $ROLE_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Role '$ROLE_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if RoleBinding exists
kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ RoleBinding '$ROLEBINDING_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if Role allows getting namespaces (to check PSS)
CAN_GET_NAMESPACES=$(kubectl get role $ROLE_NAME -n $NAMESPACE -o jsonpath='{.rules[*].resources}' | grep -o "namespaces")
if [ -z "$CAN_GET_NAMESPACES" ]; then
  echo "❌ Role does not allow viewing namespaces"
  exit 1
fi

# Check if RoleBinding references the correct Role
ROLE_REF_NAME=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.roleRef.name}')
if [ "$ROLE_REF_NAME" != "$ROLE_NAME" ]; then
  echo "❌ RoleBinding does not reference the correct Role"
  exit 1
fi

# Check if RoleBinding binds to the correct ServiceAccount
SA_NAME=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[?(@.kind=="ServiceAccount")].name}')
if [ "$SA_NAME" != "$SERVICE_ACCOUNT" ]; then
  echo "❌ RoleBinding does not bind to the correct ServiceAccount"
  exit 1
fi

echo "✅ Role and RoleBinding exist and are configured correctly"
exit 0 