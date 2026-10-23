#!/bin/bash
# Validate script for Question 14, Step 2: Check if container is running with non-root user

# Check if the container exists and is running
docker inspect secure-app &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'secure-app' does not exist"
  exit 1
fi

# Get container status
status=$(docker inspect --format='{{.State.Status}}' secure-app)

# Check if container is running or exited successfully
if [[ "$status" != "running" && "$status" != "exited" ]]; then
  echo "❌ Container 'secure-app' is not running or did not exit successfully (status: $status)"
  exit 1
fi

# Get the user that the container is running as
user_id=$(docker inspect --format='{{.Config.User}}' secure-app)

# If the user ID is numeric, check if it's not 0 (root)
if [[ "$user_id" =~ ^[0-9]+$ ]]; then
  if [ "$user_id" -eq 0 ]; then
    echo "❌ Container is running as root user (UID 0)"
    exit 1
  else
    echo "✅ Container is running with non-root user, UID: $user_id"
    exit 0
  fi
# If the user ID is a name, check if it's not root
elif [[ "$user_id" == "root" ]]; then
  echo "❌ Container is running as 'root' user"
  exit 1
elif [[ "$user_id" == "appuser" || "$user_id" == *":appuser"* || "$user_id" == "appuser:"* ]]; then
  echo "✅ Container is running as 'appuser'"
  exit 0
elif [[ -z "$user_id" ]]; then
  echo "❌ No user specified in container configuration (defaults to root)"
  exit 1
else
  echo "✅ Container is running with non-root user: $user_id"
  exit 0
fi 