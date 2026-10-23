#!/bin/bash
# Validate that restricted pod cannot access API server

NAMESPACE="api-restrict"
POD_NAME="restricted-pod"

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

# Check if pod has the right label
POD_LABEL=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.metadata.labels.role}')
if [ "$POD_LABEL" != "restricted" ]; then
  echo "❌ Pod '$POD_NAME' does not have label 'role=restricted'"
  exit 1
fi

# Test if the pod can access the API server - it should fail due to NetworkPolicy
API_SERVER_IP=$(kubectl get endpoints kubernetes -o jsonpath='{.subsets[0].addresses[0].ip}')
API_SERVER_PORT=$(kubectl get endpoints kubernetes -o jsonpath='{.subsets[0].ports[0].port}')
TEST_RESULT=$(kubectl exec -n $NAMESPACE $POD_NAME -- wget -T 3 -q -O- "https://$API_SERVER_IP:$API_SERVER_PORT" 2>&1)

if ! echo "$TEST_RESULT" | grep -q "Connection refused\|timed out\|Unable to connect"; then
  echo "❌ Restricted pod can access API server when it should be blocked"
  exit 1
fi

echo "✅ Restricted pod correctly blocked from accessing API server"
exit 0 