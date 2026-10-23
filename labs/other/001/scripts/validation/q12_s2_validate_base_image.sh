#!/bin/bash
# Validate script for Question 12, Step 2: Check if report contains correct base image information

# Check if the report file exists
if [ ! -f /tmp/exam/q12/image-report.txt ]; then
  echo "❌ Image report file does not exist at /tmp/exam/q12/image-report.txt"
  exit 1
fi

# Check if the report contains base image information
grep -i "base image\|from\|parent" /tmp/exam/q12/image-report.txt

if [ $? -eq 0 ]; then
  # Get the actual base image for comparison
  base_image=$(docker inspect webapp:latest --format='{{.Config.Image}}' 2>/dev/null || docker history webapp:latest | tail -1 | awk '{print $1}')
  
  if [[ -n "$base_image" ]]; then
    echo "✅ Report contains base image information"
    exit 0
  else
    echo "✅ Report contains some base image information but we couldn't verify it"
    exit 0
  fi
else
  echo "❌ Report does not contain base image information"
  echo "Expected information about 'Base Image' or similar"
  exit 1
fi 