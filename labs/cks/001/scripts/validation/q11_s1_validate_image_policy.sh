#!/bin/bash
# Validate that ImagePolicyWebhook admission controller is enabled

# Check if the API server is running with ImagePolicyWebhook plugin
API_SERVER_PODS=$(kubectl get pods -n kube-system -l component=kube-apiserver -o name)
if [ -z "$API_SERVER_PODS" ]; then
  echo "❌ Could not find kube-apiserver pods"
  exit 1
fi

# Get the first API server pod
API_SERVER_POD=$(echo "$API_SERVER_PODS" | head -n 1)

# Check if ImagePolicyWebhook is in the enabled admission controllers
ADMISSION_CONTROLLERS=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--enable-admission-plugins=[^ ]*" | cut -d= -f2)
if [[ "$ADMISSION_CONTROLLERS" != *"ImagePolicyWebhook"* ]]; then
  echo "❌ ImagePolicyWebhook admission controller is not enabled"
  exit 1
fi

# Check if the admission configuration file exists
ADMISSION_CONFIG=$(kubectl get $API_SERVER_POD -n kube-system -o jsonpath='{.spec.containers[0].command}' | grep -o "\--admission-control-config-file=[^ ]*" | cut -d= -f2)
if [ -z "$ADMISSION_CONFIG" ]; then
  echo "❌ No admission control configuration file specified"
  exit 1
fi

echo "✅ ImagePolicyWebhook admission controller is enabled"
exit 0