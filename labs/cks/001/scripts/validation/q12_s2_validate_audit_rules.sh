#!/bin/bash
# Validate that audit rules are correctly defined

POLICY_FILE="/etc/kubernetes/audit/audit-policy.yaml"

# Check if the audit policy file exists
if [ ! -f "$POLICY_FILE" ]; then
  echo "❌ Audit policy file not found at $POLICY_FILE"
  exit 1
fi

# Check if policy records RequestResponse level for Secret operations
SECRET_LEVEL=$(grep -A10 "resources:" "$POLICY_FILE" | grep -A10 "- group: \"\"" | grep -A10 "resources:" | grep -A3 "- secrets" | grep "level:" | head -n1 | awk '{print $2}')
if [ "$SECRET_LEVEL" != "RequestResponse" ]; then
  echo "❌ Audit policy doesn't record RequestResponse level for Secret operations"
  exit 1
fi

# Check if the policy has a rule for logging auth failures at Metadata level
AUTH_FAILURE=$(grep -A5 "nonResourceURLs:" "$POLICY_FILE" | grep -A5 "- /api*" | grep -A5 "verbs:" | grep -A5 "- get" | grep "level:" | head -n1 | awk '{print $2}')
if [ "$AUTH_FAILURE" != "Metadata" ] && [ "$AUTH_FAILURE" != "RequestResponse" ]; then
  echo "❌ Audit policy doesn't record at least Metadata level for API access"
  exit 1
fi

# Check if there's a catch-all rule at the metadata level
CATCH_ALL=$(grep -A5 "# Catch-all" "$POLICY_FILE" | grep "level:" | head -n1 | awk '{print $2}')
if [ "$CATCH_ALL" != "Metadata" ] && [ "$CATCH_ALL" != "RequestResponse" ]; then
  CATCH_ALL_ALT=$(grep -A3 "- level:" "$POLICY_FILE" | tail -n4 | grep "level:" | head -n1 | awk '{print $2}')
  if [ "$CATCH_ALL_ALT" != "Metadata" ] && [ "$CATCH_ALL_ALT" != "RequestResponse" ]; then
    echo "❌ Audit policy doesn't have a catch-all rule at Metadata level"
    exit 1
  fi
fi

# Check if the policy has a rule for ConfigMaps at Metadata level
CM_LEVEL=$(grep -A10 "resources:" "$POLICY_FILE" | grep -A10 "- group: \"\"" | grep -A10 "resources:" | grep -A3 "- configmaps" | grep "level:" | head -n1 | awk '{print $2}')
if [ "$CM_LEVEL" != "Metadata" ] && [ "$CM_LEVEL" != "RequestResponse" ]; then
  echo "❌ Audit policy doesn't record Metadata or higher level for ConfigMap operations"
  exit 1
fi

echo "✅ Audit rules are correctly defined"
exit 0 