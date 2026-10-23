#!/bin/bash
# Validate script for Question 4, Step 2: Check if service is configured correctly

# Check if kubernetes command is available
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl command not found in PATH"
  exit 1
fi

# Get the service information
service_name="web-server-nginx"
service_info=$(kubectl get service $service_name -n default -o json 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Service '$service_name' not found in namespace 'default'"
  echo "Available services:"
  kubectl get services -n default
  exit 1
fi

# Check if the service type is NodePort
service_type=$(echo "$service_info" | jq -r '.spec.type')
if [ "$service_type" != "NodePort" ]; then
  echo "❌ Service type is '$service_type', expected 'NodePort'"
  exit 1
fi

# Check if the port is configured correctly
nodeport=$(echo "$service_info" | jq -r '.spec.ports[] | select(.nodePort) | .nodePort')
if [ "$nodeport" != "30080" ]; then
  echo "❌ NodePort is '$nodeport', expected '30080'"
  echo "Service ports configuration:"
  echo "$service_info" | jq '.spec.ports'
  exit 1
fi

echo "✅ Service is correctly configured with type NodePort and port 30080"
echo "Service information:"
kubectl get service $service_name -n default -o wide
exit 0 