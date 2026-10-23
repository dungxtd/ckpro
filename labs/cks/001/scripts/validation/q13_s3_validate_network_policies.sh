#!/bin/bash
# Validate network policies are properly configured for tenant isolation

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

# Check if NetworkPolicy exists in tenant-a
kubectl get networkpolicy -n $NAMESPACE_A &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ No NetworkPolicy found in namespace '$NAMESPACE_A'"
  exit 1
fi

# Check if NetworkPolicy exists in tenant-b
kubectl get networkpolicy -n $NAMESPACE_B &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ No NetworkPolicy found in namespace '$NAMESPACE_B'"
  exit 1
fi

# Test network isolation by creating test pods
echo "Creating test pods to validate network isolation..."

# Create test pod in tenant-a
cat <<EOF | kubectl apply -f - &> /dev/null
apiVersion: v1
kind: Pod
metadata:
  name: test-pod-a
  namespace: $NAMESPACE_A
spec:
  containers:
  - name: alpine
    image: alpine
    command: ["sleep", "300"]
EOF

# Create test pod in tenant-b
cat <<EOF | kubectl apply -f - &> /dev/null
apiVersion: v1
kind: Pod
metadata:
  name: test-pod-b
  namespace: $NAMESPACE_B
spec:
  containers:
  - name: alpine
    image: alpine
    command: ["sleep", "300"]
EOF

# Wait for pods to be running
echo "Waiting for test pods to start..."
kubectl wait --for=condition=Ready pod/test-pod-a -n $NAMESPACE_A --timeout=30s &> /dev/null
kubectl wait --for=condition=Ready pod/test-pod-b -n $NAMESPACE_B --timeout=30s &> /dev/null

# Test if tenant-a pod can reach tenant-b pod (should fail if policies are working)
POD_B_IP=$(kubectl get pod test-pod-b -n $NAMESPACE_B -o jsonpath='{.status.podIP}')
ISOLATION_TEST=$(kubectl exec -n $NAMESPACE_A test-pod-a -- ping -c 1 -W 2 $POD_B_IP 2>/dev/null)
ISOLATION_STATUS=$?

# Clean up test pods
kubectl delete pod test-pod-a -n $NAMESPACE_A --force --grace-period=0 &> /dev/null
kubectl delete pod test-pod-b -n $NAMESPACE_B --force --grace-period=0 &> /dev/null

# Check if isolation is working
if [ $ISOLATION_STATUS -eq 0 ]; then
  echo "❌ Network isolation not working: Pod in tenant-a can communicate with pod in tenant-b"
  exit 1
fi

echo "✅ Network policies are properly applied for tenant isolation"
exit 0 