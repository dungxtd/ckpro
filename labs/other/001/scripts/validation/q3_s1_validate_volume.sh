#!/bin/bash
# Validate script for Question 3, Step 1: Check if volume exists

# Check if the volume exists
docker volume inspect data-volume &> /dev/null

if [ $? -eq 0 ]; then
  echo "✅ Volume 'data-volume' exists"
  exit 0
else
  echo "❌ Volume 'data-volume' does not exist"
  exit 1
fi 