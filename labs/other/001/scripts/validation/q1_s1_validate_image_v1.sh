#!/bin/bash
# Validate script for Question 1, Step 1: Check if docker-speedrun:v1 image exists

# Check if the image exists
docker image inspect docker-speedrun:v1 &> /dev/null

if [ $? -eq 0 ]; then
  echo "✅ Image 'docker-speedrun:v1' exists"
  exit 0
else
  echo "❌ Image 'docker-speedrun:v1' does not exist"
  exit 1
fi 