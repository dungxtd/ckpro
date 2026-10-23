#!/bin/bash
# Validate that audit policy is configured

POLICY_FILE="/etc/kubernetes/audit/audit-policy.yaml"

# Check if the API server is running with audit-policy-file flag
API_SERVER_PODS=$(kubectl get pods -n kube-system -l component=kube-apiserver -o name)
if [ -z "$API_SERVER_PODS" ]; then
  echo "❌ Could not find kube-apiserver pods"
  exit 1
fi

# Get the first API server pod
API_SERVER_POD=$(echo "$API_SERVER_PODS" | head -n 1)

# Check if audit policy file is specified
AUDIT_POLICY=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--audit-policy-file=[^ ]*" | cut -d= -f2)
if [ -z "$AUDIT_POLICY" ]; then
  echo "❌ API server is not configured with audit-policy-file"
  exit 1
fi

# Check if the audit policy file exists
if [ ! -f "$POLICY_FILE" ]; then
  echo "❌ Audit policy file not found at $POLICY_FILE"
  exit 1
fi

# Check if the policy file contains mandatory fields
if ! grep -q "apiVersion: audit.k8s.io/v1" "$POLICY_FILE" || ! grep -q "kind: Policy" "$POLICY_FILE"; then
  echo "❌ Audit policy file doesn't have the required structure"
  exit 1
fi

# Check if the policy contains rules field
if ! grep -q "rules:" "$POLICY_FILE"; then
  echo "❌ Audit policy file doesn't contain rules"
  exit 1
fi

# Check if audit log path is configured
AUDIT_LOG_PATH=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--audit-log-path=[^ ]*" | cut -d= -f2)
if [ -z "$AUDIT_LOG_PATH" ]; then
  echo "❌ API server is not configured with audit-log-path"
  exit 1
fi

echo "✅ Audit policy is configured"
exit 0 