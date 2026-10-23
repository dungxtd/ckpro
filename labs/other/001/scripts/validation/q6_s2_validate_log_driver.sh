#!/bin/bash
# Validate script for Question 6, Step 2: Check if container uses json-file logging driver

# Check if the container exists
docker inspect logging-test &> /dev/null

if [ $? -eq 0 ]; then
  # Get the logging driver
  log_driver=$(docker inspect --format='{{.HostConfig.LogConfig.Type}}' logging-test)
  
  if [[ "$log_driver" == "json-file" ]]; then
    echo "✅ Container 'logging-test' is using the json-file logging driver"
    exit 0
  else
    echo "❌ Container 'logging-test' is using incorrect logging driver: $log_driver (expected: json-file)"
    exit 1
  fi
else
  echo "❌ Container 'logging-test' does not exist"
  exit 1
fi 