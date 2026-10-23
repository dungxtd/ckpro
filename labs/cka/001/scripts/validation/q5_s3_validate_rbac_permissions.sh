#!/bin/bash
# Validate RBAC permissions

NAMESPACE="default"
SA_NAME="app-sa"
ROLE_NAME="pod-reader"
ROLEBINDING_NAME="read-pods"

# Check if Role has correct API groups
API_GROUPS=$(kubectl get role $ROLE_NAME -o jsonpath='{.rules[0].apiGroups[*]}')
if [[ ! "$API_GROUPS" =~ "" ]]; then
    echo "❌ Role '$ROLE_NAME' has incorrect API groups"
    exit 1
fi

# Check if Role has correct resource names
RESOURCE_NAMES=$(kubectl get role $ROLE_NAME -o jsonpath='{.rules[0].resourceNames[*]}')
if [ -n "$RESOURCE_NAMES" ]; then
    echo "❌ Role '$ROLE_NAME' has unexpected resource names restriction"
    exit 1
fi

# Check if RoleBinding has correct namespace
RB_NAMESPACE=$(kubectl get rolebinding $ROLEBINDING_NAME -o jsonpath='{.metadata.namespace}')
if [ "$RB_NAMESPACE" != "$NAMESPACE" ]; then
    echo "❌ RoleBinding '$ROLEBINDING_NAME' is in wrong namespace"
    exit 1
fi

# Test pod listing permission
if ! kubectl auth can-i list pods --as=system:serviceaccount:$NAMESPACE:$SA_NAME; then
    echo "❌ ServiceAccount does not have permission to list pods"
    exit 1
fi

# Test pod getting permission
if ! kubectl auth can-i get pods --as=system:serviceaccount:$NAMESPACE:$SA_NAME; then
    echo "❌ ServiceAccount does not have permission to get pods"
    exit 1
fi

echo "✅ RBAC permissions are correctly configured"
exit 0 