#!/bin/bash
# Validate that the NetworkPolicy has correct ingress rules

POLICY_NAME="secure-backend"
NAMESPACE="network-security"

# Check if policy exists
kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check for podSelector with app=backend
BACKEND_SELECTOR=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.podSelector.matchLabels.app}')
if [ "$BACKEND_SELECTOR" != "backend" ]; then
  echo "❌ NetworkPolicy does not select pods with label app=backend"
  exit 1
fi

# Check for ingress rule with podSelector app=frontend
FRONTEND_SELECTOR=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.ingress[0].from[0].podSelector.matchLabels.app}')
if [ "$FRONTEND_SELECTOR" != "frontend" ]; then
  echo "❌ NetworkPolicy does not allow ingress from pods with label app=frontend"
  exit 1
fi

# Check for port 8080
PORT=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.ingress[0].ports[0].port}')
if [ "$PORT" != "8080" ]; then
  echo "❌ NetworkPolicy does not specify port 8080"
  exit 1
fi

echo "✅ NetworkPolicy has correct ingress rules"
exit 0 