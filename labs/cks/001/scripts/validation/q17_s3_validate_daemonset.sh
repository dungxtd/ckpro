#!/bin/bash
# Validate that audit daemon exists

NAMESPACE="runtime-security"
DAEMONSET_NAME="audit-daemon"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if DaemonSet exists
kubectl get daemonset $DAEMONSET_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ DaemonSet '$DAEMONSET_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if DaemonSet has at least one pod running
DS_PODS=$(kubectl get pods -n $NAMESPACE -l app=$DAEMONSET_NAME -o jsonpath='{.items}')
if [ -z "$DS_PODS" ]; then
  echo "❌ No pods found for DaemonSet"
  exit 1
fi

# Check DaemonSet status
DESIRED=$(kubectl get daemonset $DAEMONSET_NAME -n $NAMESPACE -o jsonpath='{.status.desiredNumberScheduled}')
READY=$(kubectl get daemonset $DAEMONSET_NAME -n $NAMESPACE -o jsonpath='{.status.numberReady}')
if [ "$READY" -lt "$DESIRED" ]; then
  echo "❌ Not all DaemonSet pods are ready. Ready: $READY, Desired: $DESIRED"
  exit 1
fi

# Check if DaemonSet pods have necessary privileges for monitoring
SPEC=$(kubectl get daemonset $DAEMONSET_NAME -n $NAMESPACE -o json)

# Check for volume mounts (looking for access to host filesystem)
if ! echo "$SPEC" | grep -q "hostPath"; then
  echo "❌ DaemonSet doesn't have access to host filesystem via hostPath volumes"
  exit 1
fi

# Check for suspicious activity monitoring in pod spec
if ! echo "$SPEC" | grep -q "falco\|monitoring\|audit\|security"; then
  echo "❌ DaemonSet doesn't appear to be monitoring for suspicious activities"
  exit 1
fi

echo "✅ Audit daemon exists and is properly configured"
exit 0 