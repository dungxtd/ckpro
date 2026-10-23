#!/bin/bash
# Validate script for Question 6, Step 3: Check if log rotation settings are correct

# Check if the container exists
docker inspect logging-test &> /dev/null

if [ $? -eq 0 ]; then
  # Get the log config options
  log_opts=$(docker inspect --format='{{json .HostConfig.LogConfig.Config}}' logging-test)
  
  # Check for log rotation settings
  max_size=$(echo $log_opts | grep -o '"max-size":"[^"]*"' | cut -d':' -f2 | tr -d '"')
  max_file=$(echo $log_opts | grep -o '"max-file":"[^"]*"' | cut -d':' -f2 | tr -d '"')
  
  if [[ "$max_size" == "10m" && "$max_file" == "3" ]]; then
    echo "✅ Container 'logging-test' has correct log rotation settings: max-size=$max_size, max-file=$max_file"
    exit 0
  else
    echo "❌ Container 'logging-test' does not have correct log rotation settings"
    echo "Expected: max-size=10m, max-file=3"
    echo "Found: max-size=$max_size, max-file=$max_file"
    exit 1
  fi
else
  echo "❌ Container 'logging-test' does not exist"
  exit 1
fi 