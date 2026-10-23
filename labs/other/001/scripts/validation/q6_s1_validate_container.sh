#!/bin/bash
# Validate script for Question 6, Step 1: Check if logging-test container is running

# Check if the container exists and is running
docker inspect --format='{{.State.Running}}' logging-test &> /dev/null

if [ $? -eq 0 ]; then
  running=$(docker inspect --format='{{.State.Running}}' logging-test)
  if [ "$running" == "true" ]; then
    echo "✅ Container 'logging-test' is running"
    exit 0
  else
    echo "❌ Container 'logging-test' exists but is not running"
    exit 1
  fi
else
  echo "❌ Container 'logging-test' does not exist"
  exit 1
fi 