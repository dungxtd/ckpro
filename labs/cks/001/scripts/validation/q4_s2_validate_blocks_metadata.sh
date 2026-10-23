#!/bin/bash
# Validate that the NetworkPolicy blocks metadata access

POLICY_NAME="block-metadata"
NAMESPACE="metadata-protect"
METADATA_IP="169.254.169.254"

# Check if policy exists
kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if policy includes Egress in policyTypes
POLICY_TYPES=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.policyTypes}')
if [[ "$POLICY_TYPES" != *"Egress"* ]]; then
  echo "❌ NetworkPolicy does not include Egress in policyTypes"
  exit 1
fi

# Check for 169.254.169.254 denial in egress rules
# This can be achieved in different ways:
# 1. Using an except block with the metadata IP in it
# 2. Explicitly denying traffic to the metadata IP
# Let's check both possibilities

# Check for except block first
EXCEPT_BLOCKS=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.egress[*].to[*].ipBlock.except}')
if [[ "$EXCEPT_BLOCKS" == *"$METADATA_IP"* ]]; then
  echo "✅ NetworkPolicy correctly blocks metadata IP ($METADATA_IP) using except block"
  exit 0
fi

# Check if there's a rule that explicitly allows all except the metadata IP
# This is a more complex check and might be implemented in different ways
# For simplicity, we'll check if there's a rule that allows all traffic and excludes metadata
ALLOWS_ALL=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.egress[*].to[*].ipBlock.cidr}')
if [[ "$ALLOWS_ALL" == *"0.0.0.0/0"* ]] && [[ "$EXCEPT_BLOCKS" == *"$METADATA_IP"* ]]; then
  echo "✅ NetworkPolicy allows all traffic but blocks metadata IP ($METADATA_IP)"
  exit 0
fi

# If we reached here, the policy doesn't explicitly block the metadata IP
echo "❌ NetworkPolicy does not block access to metadata IP ($METADATA_IP)"
exit 1 