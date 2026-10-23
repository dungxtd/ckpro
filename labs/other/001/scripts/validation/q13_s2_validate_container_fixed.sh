#!/bin/bash
# Validate script for Question 13, Step 2: Check if container is fixed and working

# Check if the container exists
docker inspect broken-container &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'broken-container' does not exist"
  exit 1
fi

# Get container status
status=$(docker inspect --format='{{.State.Status}}' broken-container)

# Check if container is running
if [ "$status" != "running" ]; then
  echo "❌ Container 'broken-container' is not running (status: $status)"
  exit 1
fi

# Check if the config.json file was created
config_exists=$(docker exec broken-container ls -la /app/config.json 2>/dev/null)

if [ $? -ne 0 ]; then
  echo "❌ Container is running but the config file /app/config.json does not exist"
  exit 1
fi

# Check if the config.json file has valid JSON content
json_valid=$(docker exec broken-container sh -c 'cat /app/config.json | grep -o "{.*}" | wc -l')

if [ "$json_valid" -ge 1 ]; then
  echo "✅ Container is fixed and running with a valid config.json file"
  exit 0
else
  echo "❌ Container has a config.json file but it may not have valid JSON content"
  echo "Content: $(docker exec broken-container cat /app/config.json 2>/dev/null)"
  exit 1
fi 