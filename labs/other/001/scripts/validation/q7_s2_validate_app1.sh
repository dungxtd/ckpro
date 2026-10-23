#!/bin/bash
# Validate script for Question 7, Step 2: Check if app1 container is running on app-network

# Check if the container exists
docker inspect app1 &> /dev/null

if [ $? -eq 0 ]; then
  # Check if it's running
  running=$(docker inspect --format='{{.State.Running}}' app1)
  
  if [ "$running" != "true" ]; then
    echo "❌ Container 'app1' exists but is not running"
    exit 1
  fi
  
  # Check if it's on the app-network
  network=$(docker inspect --format='{{json .NetworkSettings.Networks}}' app1)
  
  if [[ $network == *"app-network"* ]]; then
    echo "✅ Container 'app1' is running on 'app-network'"
    exit 0
  else
    echo "❌ Container 'app1' is not connected to 'app-network'"
    echo "Current networks: $network"
    exit 1
  fi
else
  echo "❌ Container 'app1' does not exist"
  exit 1
fi 