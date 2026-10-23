#!/bin/bash
# Validate script for Question 7, Step 1: Check if custom network exists with correct subnet

# Check if the network exists
docker network inspect app-network &> /dev/null

if [ $? -eq 0 ]; then
  # Get subnet information
  subnet=$(docker network inspect --format='{{range .IPAM.Config}}{{.Subnet}}{{end}}' app-network)
  
  if [[ "$subnet" == "172.18.0.0/16" ]]; then
    echo "✅ Network 'app-network' exists with correct subnet: $subnet"
    exit 0
  else
    echo "❌ Network 'app-network' exists but has incorrect subnet: $subnet (expected: 172.18.0.0/16)"
    exit 1
  fi
else
  echo "❌ Network 'app-network' does not exist"
  exit 1
fi 