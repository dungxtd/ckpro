#!/bin/bash
# Validate script for Question 2, Step 2: Check if container uses the correct image

# Check if the container exists
docker inspect web-server &> /dev/null

if [ $? -eq 0 ]; then
  # Get the image name
  image=$(docker inspect --format='{{.Config.Image}}' web-server)
  
  # Check if it's using nginx:alpine
  if [[ "$image" == "nginx:alpine" ]]; then
    echo "✅ Container 'web-server' is using the correct image: $image"
    exit 0
  else
    echo "❌ Container 'web-server' is using incorrect image: $image (expected: nginx:alpine)"
    exit 1
  fi
else
  echo "❌ Container 'web-server' does not exist"
  exit 1
fi 