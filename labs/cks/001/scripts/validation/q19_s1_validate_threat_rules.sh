#!/bin/bash
# Validate that threat detection ConfigMap exists

NAMESPACE="malicious-detection"
CONFIGMAP_NAME="threat-detection"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if ConfigMap exists
kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ConfigMap '$CONFIGMAP_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Get ConfigMap data
CM_DATA=$(kubectl get configmap $CONFIGMAP_NAME -n $NAMESPACE -o jsonpath='{.data}')
if [ -z "$CM_DATA" ]; then
  echo "❌ ConfigMap doesn't have any data"
  exit 1
fi

# Check if it has rules for unusual network communication
if ! echo "$CM_DATA" | grep -q "network\|communication\|connection\|port\|scan"; then
  echo "❌ No rules for detecting unusual network communication patterns"
  exit 1
fi

# Check if it has rules for crypto mining
if ! echo "$CM_DATA" | grep -q "crypto\|mining\|miner\|bitcoin\|monero\|coin"; then
  echo "❌ No rules for detecting crypto mining activities"
  exit 1
fi

# Check if it has rules for privilege escalation
if ! echo "$CM_DATA" | grep -q "privilege\|escalation\|sudo\|root\|setuid"; then
  echo "❌ No rules for detecting privilege escalation attempts"
  exit 1
fi

echo "✅ Threat detection ConfigMap exists with required detection rules"
exit 0 