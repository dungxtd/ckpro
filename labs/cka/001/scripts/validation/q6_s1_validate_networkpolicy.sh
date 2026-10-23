#!/bin/bash
# Validate if NetworkPolicy exists with correct configuration

NAMESPACE="networking"
POLICY_NAME="db-policy"
DB_LABEL="role=db"
FRONTEND_LABEL="role=frontend"

# Check if NetworkPolicy exists
if ! kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
    exit 1
fi

# Check if policy targets pods with role=db label
TARGET_LABEL=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.podSelector.matchLabels.role}')
if [ "$TARGET_LABEL" != "db" ]; then
    echo "❌ NetworkPolicy '$POLICY_NAME' not targeting pods with label 'role=db'"
    exit 1
fi

# Check if policy allows ingress from frontend pods
INGRESS_RULES=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.ingress[*].from[*].podSelector.matchLabels.role}')
if [[ ! "$INGRESS_RULES" =~ "frontend" ]]; then
    echo "❌ NetworkPolicy '$POLICY_NAME' not allowing ingress from pods with label 'role=frontend'"
    exit 1
fi

# Check if policy allows port 3306
ALLOWED_PORTS=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.ingress[*].ports[*].port}')
if [[ ! "$ALLOWED_PORTS" =~ "3306" ]]; then
    echo "❌ NetworkPolicy '$POLICY_NAME' not allowing port 3306"
    exit 1
fi

echo "✅ NetworkPolicy '$POLICY_NAME' exists with correct configuration"
exit 0 