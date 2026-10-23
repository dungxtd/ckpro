#!/bin/bash
# Validate that the NetworkPolicy has correct egress rules

POLICY_NAME="secure-backend"
NAMESPACE="network-security"

# Check if policy exists
kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if egress is in policyTypes
POLICY_TYPES=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.policyTypes}')
if [[ "$POLICY_TYPES" != *"Egress"* ]]; then
  echo "❌ NetworkPolicy does not include Egress in policyTypes"
  exit 1
fi

# Check for egress rule with podSelector app=database
DATABASE_SELECTOR=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.egress[0].to[0].podSelector.matchLabels.app}')
if [ "$DATABASE_SELECTOR" != "database" ]; then
  echo "❌ NetworkPolicy does not restrict egress to pods with label app=database"
  exit 1
fi

# Check for port 5432
PORT=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.egress[0].ports[0].port}')
if [ "$PORT" != "5432" ]; then
  echo "❌ NetworkPolicy does not specify port 5432 for egress"
  exit 1
fi

echo "✅ NetworkPolicy has correct egress rules"
exit 0 