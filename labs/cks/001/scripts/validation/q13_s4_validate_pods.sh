#!/bin/bash
# Validate that pods are deployed correctly in tenant namespaces

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

# Check if pods exist in tenant-a
POD_COUNT_A=$(kubectl get pods -n $NAMESPACE_A -o json | jq '.items | length')
if [ "$POD_COUNT_A" -eq "0" ]; then
  echo "❌ No pods found in namespace '$NAMESPACE_A'"
  exit 1
fi

# Check if pods exist in tenant-b
POD_COUNT_B=$(kubectl get pods -n $NAMESPACE_B -o json | jq '.items | length')
if [ "$POD_COUNT_B" -eq "0" ]; then
  echo "❌ No pods found in namespace '$NAMESPACE_B'"
  exit 1
fi

# Check if pods are running in tenant-a
RUNNING_PODS_A=$(kubectl get pods -n $NAMESPACE_A -o json | jq '.items[] | select(.status.phase=="Running") | .metadata.name' | wc -l)
if [ "$RUNNING_PODS_A" -eq "0" ]; then
  echo "❌ No running pods found in namespace '$NAMESPACE_A'"
  exit 1
fi

# Check if pods are running in tenant-b
RUNNING_PODS_B=$(kubectl get pods -n $NAMESPACE_B -o json | jq '.items[] | select(.status.phase=="Running") | .metadata.name' | wc -l)
if [ "$RUNNING_PODS_B" -eq "0" ]; then
  echo "❌ No running pods found in namespace '$NAMESPACE_B'"
  exit 1
fi

# Check if pods respect resource limits
# First pod in tenant-a
POD_A=$(kubectl get pods -n $NAMESPACE_A -o jsonpath='{.items[0].metadata.name}')
LIMITS_A=$(kubectl get pod $POD_A -n $NAMESPACE_A -o json | jq -r '.spec.containers[0].resources.limits')
if [ "$LIMITS_A" == "null" ] || [ -z "$LIMITS_A" ]; then
  echo "❌ Pod '$POD_A' in namespace '$NAMESPACE_A' doesn't have resource limits defined"
  exit 1
fi

# First pod in tenant-b
POD_B=$(kubectl get pods -n $NAMESPACE_B -o jsonpath='{.items[0].metadata.name}')
LIMITS_B=$(kubectl get pod $POD_B -n $NAMESPACE_B -o json | jq -r '.spec.containers[0].resources.limits')
if [ "$LIMITS_B" == "null" ] || [ -z "$LIMITS_B" ]; then
  echo "❌ Pod '$POD_B' in namespace '$NAMESPACE_B' doesn't have resource limits defined"
  exit 1
fi

echo "✅ Pods are correctly deployed in tenant namespaces with proper resource limits"
exit 0 