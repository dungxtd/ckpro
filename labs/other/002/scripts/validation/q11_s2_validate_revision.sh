#!/bin/bash
# Validate script for Question 11, Step 2: Check if revision and configuration are correct

# Check if kubectl command is available
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl command not found in PATH"
  exit 1
fi

# Check if helm command is available
if ! command -v helm &> /dev/null; then
  echo "❌ Helm command not found in PATH"
  exit 1
fi

# Check the current revision number
revision=$(helm list -n default -f "web-server" -o json | jq -r '.[0].revision')

if [ -z "$revision" ] || [ "$revision" = "null" ]; then
  echo "❌ Could not determine revision for release 'web-server'"
  exit 1
fi

# We need to check if the replica count is back to the original value (likely 1)
# Find the deployment name
deploy_name=$(kubectl get deployments -n default -o custom-columns=NAME:.metadata.name | grep "web-server.*nginx")

if [ -z "$deploy_name" ]; then
  echo "❌ Could not find the web-server nginx deployment"
  echo "Available deployments:"
  kubectl get deployments -n default
  exit 1
fi

# Get the replica count
replicas=$(kubectl get deployment $deploy_name -n default -o jsonpath='{.spec.replicas}')

if [ -z "$replicas" ]; then
  echo "❌ Could not determine replica count for deployment '$deploy_name'"
  exit 1
fi

# If we rolled back to revision 1, we expect the replicas to be 1
# If not, we check that it's different from 3 (the value set in question 7)
if [ "$replicas" -eq 3 ]; then
  echo "❌ Replica count is still 3, rollback did not reset the configuration"
  exit 1
fi

echo "✅ Release 'web-server' is at revision $revision with replica count $replicas"
echo "Pods status:"
kubectl get pods -n default -l app=nginx,release=web-server
exit 0 