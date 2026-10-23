#!/bin/bash
# Validate script for Question 4, Step 3: Check if image size is optimized

# Check if the image exists
docker image inspect multi-stage:latest &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Image 'multi-stage:latest' does not exist"
  exit 1
fi

# Get the image size in MB
image_size=$(docker image inspect multi-stage:latest --format='{{.Size}}')
image_size_mb=$(echo "scale=2; $image_size / 1024 / 1024" | bc)

# Check if the image size is less than 20MB
if (( $(echo "$image_size_mb < 20" | bc -l) )); then
  echo "✅ Image size is optimized: ${image_size_mb}MB (less than 20MB)"
  exit 0
else
  echo "❌ Image size is not optimized: ${image_size_mb}MB (expected: less than 20MB)"
  exit 1
fi 