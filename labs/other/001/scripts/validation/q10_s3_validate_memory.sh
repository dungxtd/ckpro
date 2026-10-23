#!/bin/bash
# Validate script for Question 10, Step 3: Check if memory limit is set correctly

# Check if the container exists
docker inspect limited-resources &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'limited-resources' does not exist"
  exit 1
fi

# Get the memory limit in bytes
memory_bytes=$(docker inspect --format='{{.HostConfig.Memory}}' limited-resources)
memory_mb=$(( memory_bytes / 1024 / 1024 ))

# Check if it's set to 256MB (allow a small tolerance)
if [[ "$memory_mb" -ge 255 && "$memory_mb" -le 257 ]]; then
  echo "✅ Container memory limit is set correctly: ${memory_mb}MB"
  exit 0
else
  echo "❌ Container memory limit is not set to 256MB: ${memory_mb}MB"
  exit 1
fi 