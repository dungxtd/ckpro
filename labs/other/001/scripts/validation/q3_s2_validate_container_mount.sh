#!/bin/bash
# Validate script for Question 3, Step 2: Check if container was created with correct mount

# Check if the container exists or existed
docker inspect volume-test &> /dev/null

if [ $? -eq 0 ]; then
  # Get mount information
  mount_info=$(docker inspect --format='{{json .Mounts}}' volume-test)
  
  # Check if the volume is mounted at the correct path
  if [[ $mount_info == *"data-volume"* && $mount_info == *"/app/data"* ]]; then
    echo "✅ Container 'volume-test' was created with the correct mount"
    exit 0
  else
    echo "❌ Container 'volume-test' does not have correct volume mount"
    echo "Current mounts: $mount_info"
    exit 1
  fi
else
  echo "❌ Container 'volume-test' does not exist"
  exit 1
fi 