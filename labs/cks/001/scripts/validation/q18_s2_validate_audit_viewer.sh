#!/bin/bash
# Validate that audit viewer pod exists

NAMESPACE="audit-logging"
POD_NAME="audit-viewer"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod is running
POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
  echo "❌ Pod is not running. Current status: $POD_STATUS"
  exit 1
fi

# Check if pod has necessary permissions to view audit logs
# Check if pod is using a ServiceAccount
SA_NAME=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.serviceAccountName}')
if [ -z "$SA_NAME" ] || [ "$SA_NAME" == "default" ]; then
  # If no custom SA is used, check if pod is mounting audit log volume directly
  VOLUMES=$(kubectl get pod $POD_NAME -n $NAMESPACE -o json)
  if ! echo "$VOLUMES" | grep -q "hostPath\|audit\|log"; then
    echo "❌ Pod doesn't have permissions to view audit logs"
    exit 1
  fi
else
  # Check if the ServiceAccount has permissions to view audit logs
  ROLE_BINDING=$(kubectl get rolebinding,clusterrolebinding --all-namespaces -o json | grep -B5 -A5 "$SA_NAME")
  if [ -z "$ROLE_BINDING" ]; then
    echo "❌ No RoleBinding or ClusterRoleBinding found for ServiceAccount $SA_NAME"
    exit 1
  fi
  
  if ! echo "$ROLE_BINDING" | grep -q "get\|list\|watch"; then
    echo "❌ ServiceAccount doesn't have permissions to view resources (get/list/watch)"
    exit 1
  fi
fi

echo "✅ Audit viewer pod exists with appropriate permissions"
exit 0 