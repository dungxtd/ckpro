#!/bin/bash
# Validate script for Question 2, Step 1: Check if container is running

# Check if the container exists and is running
docker inspect --format='{{.State.Running}}' web-server &> /dev/null

if [ $? -eq 0 ]; then
  running=$(docker inspect --format='{{.State.Running}}' web-server)
  if [ "$running" == "true" ]; then
    echo "✅ Container 'web-server' is running"
    exit 0
  else
    echo "❌ Container 'web-server' exists but is not running"
    exit 1
  fi
else
  echo "❌ Container 'web-server' does not exist"
  exit 1
fi 