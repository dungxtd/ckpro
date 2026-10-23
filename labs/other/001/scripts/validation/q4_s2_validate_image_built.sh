#!/bin/bash
# Validate script for Question 4, Step 2: Check if image was built successfully

# Check if the image exists
docker image inspect multi-stage:latest &> /dev/null

if [ $? -eq 0 ]; then
  echo "✅ Image 'multi-stage:latest' exists"
  exit 0
else
  echo "❌ Image 'multi-stage:latest' does not exist"
  exit 1
fi
 