#!/bin/bash
# Validate resource quotas are applied to tenant namespaces

# Define namespaces to check
NAMESPACE_A="tenant-a"
NAMESPACE_B="tenant-b"

# Check if tenant-a namespace exists
kubectl get namespace $NAMESPACE_A &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE_A' not found"
  exit 1
fi

# Check if tenant-b namespace exists
kubectl get namespace $NAMESPACE_B &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE_B' not found"
  exit 1
fi

# Check for ResourceQuota in tenant-a
kubectl get resourcequota -n $NAMESPACE_A &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ResourceQuota not found in namespace '$NAMESPACE_A'"
  exit 1
fi

# Check for ResourceQuota in tenant-b
kubectl get resourcequota -n $NAMESPACE_B &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ ResourceQuota not found in namespace '$NAMESPACE_B'"
  exit 1
fi

# Verify quota specifications for tenant-a
CPU_QUOTA_A=$(kubectl get resourcequota -n $NAMESPACE_A -o jsonpath='{.items[0].spec.hard.cpu}' 2>/dev/null)
MEM_QUOTA_A=$(kubectl get resourcequota -n $NAMESPACE_A -o jsonpath='{.items[0].spec.hard.memory}' 2>/dev/null)
PODS_QUOTA_A=$(kubectl get resourcequota -n $NAMESPACE_A -o jsonpath='{.items[0].spec.hard.pods}' 2>/dev/null)

if [ -z "$CPU_QUOTA_A" ] || [ -z "$MEM_QUOTA_A" ] || [ -z "$PODS_QUOTA_A" ]; then
  echo "❌ ResourceQuota in namespace '$NAMESPACE_A' is missing required limit specifications"
  exit 1
fi

# Verify quota specifications for tenant-b
CPU_QUOTA_B=$(kubectl get resourcequota -n $NAMESPACE_B -o jsonpath='{.items[0].spec.hard.cpu}' 2>/dev/null)
MEM_QUOTA_B=$(kubectl get resourcequota -n $NAMESPACE_B -o jsonpath='{.items[0].spec.hard.memory}' 2>/dev/null)
PODS_QUOTA_B=$(kubectl get resourcequota -n $NAMESPACE_B -o jsonpath='{.items[0].spec.hard.pods}' 2>/dev/null)

if [ -z "$CPU_QUOTA_B" ] || [ -z "$MEM_QUOTA_B" ] || [ -z "$PODS_QUOTA_B" ]; then
  echo "❌ ResourceQuota in namespace '$NAMESPACE_B' is missing required limit specifications"
  exit 1
fi

echo "✅ Resource quotas are properly applied to tenant namespaces"
exit 0 