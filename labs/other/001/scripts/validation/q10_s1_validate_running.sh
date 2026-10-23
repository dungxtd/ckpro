#!/bin/bash
# Validate script for Question 10, Step 1: Check if limited-resources container is running

# Check if the container exists and is running
docker inspect --format='{{.State.Running}}' limited-resources &> /dev/null

if [ $? -eq 0 ]; then
  running=$(docker inspect --format='{{.State.Running}}' limited-resources)
  if [ "$running" == "true" ]; then
    echo "✅ Container 'limited-resources' is running"
    exit 0
  else
    echo "❌ Container 'limited-resources' exists but is not running"
    exit 1
  fi
else
  echo "❌ Container 'limited-resources' does not exist"
  exit 1
fi 