#!/bin/bash
# Validate that the RoleBinding is correctly configured

ROLE_NAME="app-reader-role"
ROLEBINDING_NAME="app-reader-binding"
NAMESPACE="rbac-minimize"
SERVICE_ACCOUNT="app-service-account"

# Check if RoleBinding exists
kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ RoleBinding '$ROLEBINDING_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if RoleBinding references the correct Role
REFERENCED_ROLE=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.roleRef.name}')
if [ "$REFERENCED_ROLE" != "$ROLE_NAME" ]; then
  echo "❌ RoleBinding does not reference the correct Role. Expected: $ROLE_NAME, Got: $REFERENCED_ROLE"
  exit 1
fi

# Check if RoleBinding references the correct ServiceAccount
SUBJECTS=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[*].name}')
if [[ "$SUBJECTS" != *"$SERVICE_ACCOUNT"* ]]; then
  echo "❌ RoleBinding does not bind to the service account: $SERVICE_ACCOUNT"
  exit 1
fi

# Check if RoleBinding has the correct kind
SUBJECT_KIND=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[0].kind}')
if [ "$SUBJECT_KIND" != "ServiceAccount" ]; then
  echo "❌ RoleBinding subject is not a ServiceAccount. Got: $SUBJECT_KIND"
  exit 1
fi

echo "✅ RoleBinding is correctly configured"
exit 0 