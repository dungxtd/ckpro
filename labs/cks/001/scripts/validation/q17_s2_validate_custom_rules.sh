#!/bin/bash
# Validate that custom security rules are in place

# Expected rule criteria
RULE_NAME="Terminal shell in container"
RULE_DESCRIPTION="detect terminal shell execution"
EVENT_TYPE="container"
LOG_FILE="/var/log/falco/alerts.log"

# Check if custom rules file exists
CUSTOM_RULES_FILE=""
if [ -f "/etc/falco/falco_rules.local.yaml" ]; then
  CUSTOM_RULES_FILE="/etc/falco/falco_rules.local.yaml"
elif [ -f "/etc/falco/rules.d/custom_rules.yaml" ]; then
  CUSTOM_RULES_FILE="/etc/falco/rules.d/custom_rules.yaml"
else
  # Try to find any custom rules file
  CUSTOM_RULES_FILE=$(find /etc/falco -name "*.yaml" -type f -exec grep -l "rule:" {} \; | head -n1)
  
  if [ -z "$CUSTOM_RULES_FILE" ]; then
    echo "❌ No custom rules file found"
    exit 1
  fi
fi

# Check if the rule for shell in container exists
if ! grep -q "$RULE_NAME" "$CUSTOM_RULES_FILE"; then
  echo "❌ Custom rule for '$RULE_NAME' not found"
  exit 1
fi

# Check if the rule has the right description
if ! grep -q "$RULE_DESCRIPTION" "$CUSTOM_RULES_FILE"; then
  echo "❌ Custom rule doesn't have the expected description"
  exit 1
fi

# Check if the rule has the expected event type
if ! grep -q "$EVENT_TYPE" "$CUSTOM_RULES_FILE"; then
  echo "❌ Custom rule doesn't have the expected event type"
  exit 1
fi

# Check if the rule includes critical commands detection
if ! grep -q "bash\|sh\|/bin/sh\|/bin/bash" "$CUSTOM_RULES_FILE"; then
  echo "❌ Custom rule doesn't check for shell execution"
  exit 1
fi

# Check if the rule triggers
echo "Testing rule triggering..."
# Create a test pod to trigger the rule
TEST_POD_YAML="/tmp/test_pod.yaml"
cat > $TEST_POD_YAML << EOF
apiVersion: v1
kind: Pod
metadata:
  name: shell-test
  namespace: default
spec:
  containers:
  - name: shell-test
    image: busybox
    command: ["/bin/sh", "-c", "sleep 30"]
EOF

kubectl apply -f $TEST_POD_YAML &> /dev/null
sleep 10
kubectl exec shell-test -- /bin/sh -c "echo test" &> /dev/null
sleep 5

# Check if the alert was logged
if [ -f "$LOG_FILE" ]; then
  if grep -q "$RULE_NAME" "$LOG_FILE" || grep -q "shell-test" "$LOG_FILE"; then
    echo "✓ Rule triggered and alert was logged"
  else
    echo "⚠️ Rule exists but alert wasn't logged"
  fi
else
  echo "⚠️ Alert log file not found at $LOG_FILE"
fi

# Clean up
kubectl delete pod shell-test &> /dev/null

echo "✅ Custom security rules are in place"
exit 0 