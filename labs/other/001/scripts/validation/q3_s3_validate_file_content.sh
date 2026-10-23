#!/bin/bash
# Validate script for Question 3, Step 3: Check if file exists in the volume with correct content

# Check if the volume exists
docker volume inspect data-volume &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Volume 'data-volume' does not exist"
  exit 1
fi

# Create a temporary container to check the volume content
file_content=$(docker run --rm -v data-volume:/app/data alpine:latest cat /app/data/test.txt 2>/dev/null)

if [ $? -eq 0 ]; then
  # Check if the file content is correct
  if [[ "$file_content" == "Docker volumes test" ]]; then
    echo "✅ File '/app/data/test.txt' exists in the volume with correct content"
    exit 0
  else
    echo "❌ File exists but has incorrect content"
    echo "Expected: 'Docker volumes test'"
    echo "Found: '$file_content'"
    exit 1
  fi
else
  echo "❌ File '/app/data/test.txt' does not exist in the volume"
  exit 1
fi 