#!/bin/bash
# Validate script for Question 12, Step 2: Check if release issue is fixed

# Check if helm command is available
if ! command -v helm &> /dev/null; then
  echo "❌ Helm command not found in PATH"
  exit 1
fi

# Check if the release exists
release_info=$(helm list -n default -f "buggy-app" 2>&1)

if [ $? -ne 0 ] || ! echo "$release_info" | grep -q "buggy-app"; then
  echo "❌ Release 'buggy-app' not found in namespace 'default'"
  echo "Current releases:"
  helm list -n default
  exit 1
fi

# Check if the release status is deployed/succeeded
status=$(helm list -n default -f "buggy-app" -o json | jq -r '.[0].status')
if [ "$status" != "deployed" ]; then
  echo "❌ Release 'buggy-app' is not in 'deployed' status (current: $status)"
  exit 1
fi

# Check if the pods are running
deploy_name=$(kubectl get deployments -n default -o custom-columns=NAME:.metadata.name | grep "buggy-app" | head -1)
if [ -z "$deploy_name" ]; then
  echo "❌ Could not find any deployment for 'buggy-app'"
  echo "Available deployments:"
  kubectl get deployments -n default
  exit 1
fi

# Check pod status
pod_status=$(kubectl get pods -n default -l app.kubernetes.io/instance=buggy-app -o jsonpath='{.items[0].status.phase}' 2>/dev/null)

if [ -z "$pod_status" ]; then
  echo "❌ No pods found for 'buggy-app'"
  echo "Available pods:"
  kubectl get pods -n default
  exit 1
fi

if [ "$pod_status" != "Running" ]; then
  echo "❌ Pod for 'buggy-app' is not running (status: $pod_status)"
  echo "Pod details:"
  kubectl get pods -n default -l app.kubernetes.io/instance=buggy-app -o wide
  exit 1
fi

echo "✅ 'buggy-app' release has been fixed and is running correctly"
echo "Release status: $status"
echo "Pod status: $pod_status"
exit 0 