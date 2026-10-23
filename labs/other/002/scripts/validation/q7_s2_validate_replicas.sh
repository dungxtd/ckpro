#!/bin/bash
# Validate script for Question 7, Step 2: Check if replica count is 3

# Check if kubectl command is available
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl command not found in PATH"
  exit 1
fi

# Find the deployment name (assuming it has web-server and nginx in the name)
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

if [ "$replicas" -ne 3 ]; then
  echo "❌ Deployment '$deploy_name' does not have 3 replicas (current: $replicas)"
  exit 1
fi

# Also check if the pods are actually running
ready_pods=$(kubectl get deployment $deploy_name -n default -o jsonpath='{.status.readyReplicas}')
if [ -z "$ready_pods" ] || [ "$ready_pods" -ne 3 ]; then
  echo "❌ Deployment has 3 replicas set but only $ready_pods pods are ready"
  echo "Pods status:"
  kubectl get pods -n default -l app=nginx,release=web-server
  exit 1
fi

echo "✅ Deployment '$deploy_name' has 3 replicas and all pods are ready"
echo "Pods status:"
kubectl get pods -n default -l app=nginx,release=web-server
exit 0 