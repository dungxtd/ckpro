#!/bin/bash
# Validate that the Ingress has correct hostname configuration

INGRESS_NAME="secure-app"
NAMESPACE="secure-ingress"
EXPECTED_HOSTNAME="secure-app.example.com"

# Check if ingress exists
kubectl get ingress $INGRESS_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Ingress '$INGRESS_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check for correct hostname
HOSTNAME=$(kubectl get ingress $INGRESS_NAME -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}')
if [ "$HOSTNAME" = "$EXPECTED_HOSTNAME" ]; then
  echo "✅ Ingress has correct hostname: $EXPECTED_HOSTNAME"
  exit 0
else
  echo "❌ Ingress has incorrect hostname: $HOSTNAME (expected: $EXPECTED_HOSTNAME)"
  exit 1
fi 