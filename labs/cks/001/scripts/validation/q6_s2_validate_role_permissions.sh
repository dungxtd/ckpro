#!/bin/bash
# Validate that the Role has correct permissions

ROLE_NAME="app-reader-role"
NAMESPACE="rbac-minimize"
ALLOWED_RESOURCES=("pods" "services" "deployments")
FORBIDDEN_RESOURCES=("secrets" "configmaps")
ALLOWED_VERBS=("get" "list" "watch")

# Check if role exists
kubectl get role $ROLE_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Role '$ROLE_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if role allows access to required resources
RESOURCES=$(kubectl get role $ROLE_NAME -n $NAMESPACE -o jsonpath='{.rules[*].resources}')
for resource in "${ALLOWED_RESOURCES[@]}"; do
  if [[ "$RESOURCES" != *"$resource"* ]]; then
    echo "❌ Role does not allow access to resource: $resource"
    exit 1
  fi
done

# Check if role does NOT allow access to forbidden resources
for resource in "${FORBIDDEN_RESOURCES[@]}"; do
  if [[ "$RESOURCES" == *"$resource"* ]]; then
    echo "❌ Role allows access to forbidden resource: $resource"
    exit 1
  fi
done

# Check if role has the correct verbs (get, list, watch)
VERBS=$(kubectl get role $ROLE_NAME -n $NAMESPACE -o jsonpath='{.rules[*].verbs}')
for verb in "${ALLOWED_VERBS[@]}"; do
  if [[ "$VERBS" != *"$verb"* ]]; then
    echo "❌ Role does not allow '$verb' permission"
    exit 1
  fi
done

# Make sure create/update/delete verbs are not included
if [[ "$VERBS" == *"create"* ]] || [[ "$VERBS" == *"update"* ]] || [[ "$VERBS" == *"delete"* ]] || [[ "$VERBS" == *"patch"* ]]; then
  echo "❌ Role allows modification verbs (create/update/delete/patch) which should not be allowed for a reader role"
  exit 1
fi

echo "✅ Role has correct minimal permissions"
exit 0 