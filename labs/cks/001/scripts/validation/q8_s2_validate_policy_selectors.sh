#!/bin/bash
# Validate that the NetworkPolicy has correct selectors and egress rules

POLICY_NAME="api-server-policy"
NAMESPACE="api-restrict"

# Check if namespace exists
kubectl get namespace "$NAMESPACE" &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if NetworkPolicy exists
kubectl get networkpolicy "$POLICY_NAME" -n "$NAMESPACE" &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if policy includes Egress in policyTypes
POLICY_TYPES=$(kubectl get networkpolicy "$POLICY_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.policyTypes}')
if [[ "$POLICY_TYPES" != *"Egress"* ]]; then
  echo "❌ NetworkPolicy does not include Egress in policyTypes"
  exit 1
fi

# Check if it denies traffic to API server IP
API_SERVER_IP=$(kubectl get svc kubernetes -n default -o jsonpath='{.spec.clusterIP}')
if ! kubectl get networkpolicy "$POLICY_NAME" -n "$NAMESPACE" -o json | grep -q "$API_SERVER_IP"; then
  echo "❌ NetworkPolicy does not target the API server IP ($API_SERVER_IP)"
  exit 1
fi

echo "✅ NetworkPolicy '$POLICY_NAME' is correctly configured"
exit 0
