#!/bin/bash
# Validate script for Question 2, Step 4: Check if environment variable is set correctly

# Check if the container exists
docker inspect web-server &> /dev/null

if [ $? -eq 0 ]; then
  # Check if the environment variable is set
  env_var=$(docker exec web-server env | grep NGINX_HOST)
  
  if [[ "$env_var" == "NGINX_HOST=localhost" ]]; then
    echo "✅ Container 'web-server' has correct environment variable set: $env_var"
    exit 0
  else
    echo "❌ Container 'web-server' does not have correct environment variable"
    echo "Expected: NGINX_HOST=localhost"
    echo "Found: $env_var"
    exit 1
  fi
else
  echo "❌ Container 'web-server' does not exist"
  exit 1
fi 