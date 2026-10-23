#!/bin/bash
# Validate if Role and RoleBinding exist with correct permissions

NAMESPACE="default"
ROLE_NAME="pod-reader"
ROLEBINDING_NAME="read-pods"
SA_NAME="app-sa"

# Check if Role exists
if ! kubectl get role $ROLE_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ Role '$ROLE_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

# Check if Role has correct permissions
VERBS=$(kubectl get role $ROLE_NAME -n $NAMESPACE -o jsonpath='{.rules[0].verbs[*]}')
RESOURCES=$(kubectl get role $ROLE_NAME -n $NAMESPACE -o jsonpath='{.rules[0].resources[*]}')

if [[ ! "$VERBS" =~ "get" ]] || [[ ! "$VERBS" =~ "list" ]]; then
    echo "❌ Role '$ROLE_NAME' missing required permissions (get and/or list)"
    exit 1
fi

if [[ ! "$RESOURCES" =~ "pods" ]]; then
    echo "❌ Role '$ROLE_NAME' not configured for pods resource"
    exit 1
fi

# Check if RoleBinding exists
if ! kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ RoleBinding '$ROLEBINDING_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

# Check if RoleBinding links correct Role and ServiceAccount
BOUND_ROLE=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.roleRef.name}')
BOUND_SA=$(kubectl get rolebinding $ROLEBINDING_NAME -n $NAMESPACE -o jsonpath='{.subjects[?(@.kind=="ServiceAccount")].name}')

if [ "$BOUND_ROLE" != "$ROLE_NAME" ]; then
    echo "❌ RoleBinding '$ROLEBINDING_NAME' not bound to correct role (found: $BOUND_ROLE, expected: $ROLE_NAME)"
    exit 1
fi

if [ "$BOUND_SA" != "$SA_NAME" ]; then
    echo "❌ RoleBinding '$ROLEBINDING_NAME' not bound to correct ServiceAccount (found: $BOUND_SA, expected: $SA_NAME)"
    exit 1
fi

echo "✅ Role and RoleBinding exist with correct configuration"
exit 0 