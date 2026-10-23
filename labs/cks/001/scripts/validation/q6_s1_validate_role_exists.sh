#!/bin/bash
# Validate that the Role exists

ROLE_NAME="app-reader-role"
NAMESPACE="rbac-minimize"

kubectl get role $ROLE_NAME -n $NAMESPACE &> /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Role '$ROLE_NAME' exists in namespace '$NAMESPACE'"
  exit 0
else
  echo "❌ Role '$ROLE_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi 