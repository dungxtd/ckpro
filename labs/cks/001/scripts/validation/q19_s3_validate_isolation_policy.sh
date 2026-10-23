#!/bin/bash
# Validate that isolation NetworkPolicy exists

NAMESPACE="malicious-detection"
POLICY_NAME="isolate-compromised"
LABEL_SELECTOR="security-status=compromised"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if NetworkPolicy exists
kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ NetworkPolicy '$POLICY_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Get NetworkPolicy spec
POLICY_SPEC=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o json)

# Check if policy uses the correct pod selector
POD_SELECTOR=$(echo "$POLICY_SPEC" | grep -o "podSelector.*" | grep -o "security-status.*compromised")
if [ -z "$POD_SELECTOR" ]; then
  echo "❌ NetworkPolicy doesn't select pods with label '$LABEL_SELECTOR'"
  exit 1
fi

# Check if policy blocks all ingress
INGRESS_RULES=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.ingress}')
if [ "$INGRESS_RULES" != "[]" ] && [ -n "$INGRESS_RULES" ]; then
  echo "❌ NetworkPolicy doesn't block all ingress traffic"
  exit 1
fi

# Check if policy blocks all egress
EGRESS_RULES=$(kubectl get networkpolicy $POLICY_NAME -n $NAMESPACE -o jsonpath='{.spec.egress}')
if [ "$EGRESS_RULES" != "[]" ] && [ -n "$EGRESS_RULES" ]; then
  echo "❌ NetworkPolicy doesn't block all egress traffic"
  exit 1
fi

# Verify policy works by creating a test pod with the label
TEST_POD_YAML="/tmp/isolation-test-pod.yaml"
cat > $TEST_POD_YAML << EOF
apiVersion: v1
kind: Pod
metadata:
  name: isolation-test
  namespace: $NAMESPACE
  labels:
    security-status: compromised
spec:
  containers:
  - name: busybox
    image: busybox
    command: ["sleep", "3600"]
EOF

# Apply test pod
kubectl apply -f $TEST_POD_YAML &> /dev/null
sleep 5

# Try to connect from test pod to internet
CONNECTIVITY_TEST=$(kubectl exec -n $NAMESPACE isolation-test -- wget -O- -T 2 -q google.com 2>&1)
if ! echo "$CONNECTIVITY_TEST" | grep -q "wget: bad address\|timed out\|can't connect\|Operation not permitted\|network is unreachable"; then
  echo "❌ NetworkPolicy isolation doesn't work as expected"
  kubectl delete -f $TEST_POD_YAML &> /dev/null
  exit 1
fi

# Clean up
kubectl delete -f $TEST_POD_YAML &> /dev/null

echo "✅ Isolation NetworkPolicy exists and works properly"
exit 0 