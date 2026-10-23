#!/bin/bash
# Validate script for Question 1, Step 2: Check if docker-speedrun:latest image exists

# Check if the image exists
docker image inspect docker-speedrun:latest &> /dev/null

if [ $? -eq 0 ]; then
  echo "✅ Image 'docker-speedrun:latest' exists"
  exit 0
else
  echo "❌ Image 'docker-speedrun:latest' does not exist"
  exit 1
fi 