#!/bin/bash
# Validate that audit policy ConfigMap exists

NAMESPACE="audit-logging"
CONFIGMAP_NAME="audit-policy"

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

# Check if policy has required structure
if ! echo "$CM_DATA" | grep -q "apiVersion.*audit.k8s.io\/"; then
  echo "❌ Audit policy doesn't have correct API version"
  exit 1
fi

if ! echo "$CM_DATA" | grep -q "kind.*Policy"; then
  echo "❌ Audit policy doesn't have correct kind"
  exit 1
fi

if ! echo "$CM_DATA" | grep -q "rules:"; then
  echo "❌ Audit policy doesn't define rules"
  exit 1
fi

# Check if policy includes required audit levels
if ! echo "$CM_DATA" | grep -q "Metadata"; then
  echo "❌ Audit policy doesn't use Metadata level"
  exit 1
fi

if ! echo "$CM_DATA" | grep -q "RequestResponse"; then
  echo "❌ Audit policy doesn't use RequestResponse level"
  exit 1
fi

# Check specific audit requirements
if ! echo "$CM_DATA" | grep -q "RequestResponse.*pods"; then
  echo "❌ Audit policy doesn't audit pod operations at RequestResponse level"
  exit 1
fi

if ! echo "$CM_DATA" | grep -q "RequestResponse.*authentication"; then
  echo "❌ Audit policy doesn't audit authentication at RequestResponse level"
  exit 1
fi

echo "✅ Audit policy ConfigMap exists with required audit configuration"
exit 0 