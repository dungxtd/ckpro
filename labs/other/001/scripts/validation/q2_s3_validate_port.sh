#!/bin/bash
# Validate script for Question 2, Step 3: Check if port mapping is correct

# Check if the container exists
docker inspect web-server &> /dev/null

if [ $? -eq 0 ]; then
  # Get the port mappings
  port_mappings=$(docker inspect --format='{{json .HostConfig.PortBindings}}' web-server)
  
  # Check if port 8080 is mapped to 80
  if [[ $port_mappings == *"8080"* && $port_mappings == *"80"* ]]; then
    echo "✅ Container 'web-server' has correct port mapping (8080->80)"
    exit 0
  else
    echo "❌ Container 'web-server' does not have correct port mapping (expected: 8080->80)"
    echo "Current port mappings: $port_mappings"
    exit 1
  fi
else
  echo "❌ Container 'web-server' does not exist"
  exit 1
fi 