#!/bin/bash
# Validate that the RoleBinding exists and is correct

NAMESPACE="rbac-minimize"
ROLEBINDING_NAME="app-reader-binding"
ROLE_NAME="app-reader-role"
SERVICE_ACCOUNT="app-reader"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if RoleBinding exists
kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ RoleBinding '$ROLEBINDING_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if RoleBinding references the correct Role
ROLE_REF=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.roleRef.name}')
if [ "$ROLE_REF" != "$ROLE_NAME" ]; then
  echo "❌ RoleBinding does not reference the correct Role '$ROLE_NAME' (actual: $ROLE_REF)"
  exit 1
fi

# Check if RoleBinding references the correct ServiceAccount
SUBJECT_KIND=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[0].kind}')
SUBJECT_NAME=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[0].name}')

if [ "$SUBJECT_KIND" != "ServiceAccount" ]; then
  echo "❌ RoleBinding subject is not a ServiceAccount (actual: $SUBJECT_KIND)"
  exit 1
fi

if [ "$SUBJECT_NAME" != "$SERVICE_ACCOUNT" ]; then
  echo "❌ RoleBinding does not reference the correct ServiceAccount '$SERVICE_ACCOUNT' (actual: $SUBJECT_NAME)"
  exit 1
fi

echo "✅ RoleBinding exists and is correctly configured"
exit 0 