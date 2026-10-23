#!/bin/bash
# Validate script for Question 11, Step 3: Check if network and volume configuration is correct

# Check if the compose file exists
if [ ! -f /tmp/exam/q11/docker-compose.yml ]; then
  echo "❌ Docker Compose file does not exist at /tmp/exam/q11/docker-compose.yml"
  exit 1
fi

# Change to the directory with the docker-compose file
cd /tmp/exam/q11

# Check if a custom network is defined
grep -q "^networks:" docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file does not define networks section"
  exit 1
fi

# Check if a volume is defined
grep -q "^volumes:" docker-compose.yml
if [ $? -ne 0 ]; then
  echo "❌ Docker Compose file does not define volumes section"
  exit 1
fi

# Check if the web service is using the network
grep -E -A10 "^  web:" docker-compose.yml | grep -q "networks:"
if [ $? -ne 0 ]; then
  echo "❌ Web service is not configured to use the custom network"
  exit 1
fi

# Check if the db service is using the network and volume
grep -E -A20 "^  db:" docker-compose.yml | grep -q "networks:"
if [ $? -ne 0 ]; then
  echo "❌ DB service is not configured to use the custom network"
  exit 1
fi

grep -E -A20 "^  db:" docker-compose.yml | grep -q "volumes:"
if [ $? -ne 0 ]; then
  echo "❌ DB service is not configured to use a volume"
  exit 1
fi

echo "✅ Docker Compose file has correct network and volume configuration"
exit 0 