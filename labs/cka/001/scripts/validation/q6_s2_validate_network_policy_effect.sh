#!/bin/bash
# Validate network policy effectiveness

NAMESPACE="networking"
FRONTEND_POD="frontend"
DB_POD="db"

# Check if frontend pod exists
if ! kubectl get pod $FRONTEND_POD -n $NAMESPACE &> /dev/null; then
    echo "❌ Frontend pod not found"
    exit 1
fi

# Check if db pod exists
if ! kubectl get pod $DB_POD -n $NAMESPACE &> /dev/null; then
    echo "❌ Database pod not found"
    exit 1
fi

# Check if network policy is applied to correct pods
POLICY_PODS=$(kubectl get networkpolicy db-policy -n $NAMESPACE -o jsonpath='{.spec.podSelector.matchLabels.role}')
if [ "$POLICY_PODS" != "db" ]; then
    echo "❌ Network policy is not applied to correct pods"
    exit 1
fi

# Check if network policy has correct policy types
POLICY_TYPES=$(kubectl get networkpolicy db-policy -n $NAMESPACE -o jsonpath='{.spec.policyTypes[*]}')
if [[ ! "$POLICY_TYPES" =~ "Ingress" ]]; then
    echo "❌ Network policy missing Ingress policy type"
    exit 1
fi

# Check if network policy has correct port configuration
POLICY_PORT=$(kubectl get networkpolicy db-policy -n $NAMESPACE -o jsonpath='{.spec.ingress[0].ports[0].port}')
if [ "$POLICY_PORT" != "3306" ]; then
    echo "❌ Network policy has incorrect port configuration"
    exit 1
fi

echo "✅ Network policy is correctly configured and effective"
exit 0 