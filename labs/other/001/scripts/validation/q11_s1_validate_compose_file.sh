#!/bin/bash
# Validate script for Question 11, Step 1: Check if Docker Compose file exists and has correct format

# Check if the compose file exists
if [ ! -f /tmp/exam/q11/docker-compose.yml ]; then
  echo "❌ Docker Compose file does not exist at /tmp/exam/q11/docker-compose.yml"
  exit 1
fi

# Check basic structure of the compose file
grep -q "^version:" /tmp/exam/q11/docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file is missing version field"
  exit 1
fi

grep -q "^services:" /tmp/exam/q11/docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file is missing services section"
  exit 1
fi

# Check for required services
grep -q "  web:" /tmp/exam/q11/docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file is missing 'web' service"
  exit 1
fi

grep -q "  db:" /tmp/exam/q11/docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file is missing 'db' service"
  exit 1
fi

echo "✅ Docker Compose file exists with correct basic structure"
exit 0 