#!/bin/bash
# Validate script for Question 11, Step 2: Check if services are running

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
  echo "❌ docker-compose command not found"
  exit 1
fi

# Check if the compose file exists
if [ ! -f /tmp/exam/q11/docker-compose.yml ]; then
  echo "❌ Docker Compose file does not exist at /tmp/exam/q11/docker-compose.yml"
  exit 1
fi

# Change to the directory with the docker-compose file
cd /tmp/exam/q11

# Check if the services are running
docker-compose ps --services --filter "status=running" | grep -q "web"
web_running=$?

docker-compose ps --services --filter "status=running" | grep -q "db"
db_running=$?

if [ $web_running -eq 0 ] && [ $db_running -eq 0 ]; then
  echo "✅ Both 'web' and 'db' services are running"
  exit 0
elif [ $web_running -eq 0 ]; then
  echo "❌ 'web' service is running but 'db' service is not"
  exit 1
elif [ $db_running -eq 0 ]; then
  echo "❌ 'db' service is running but 'web' service is not"
  exit 1
else
  echo "❌ Neither 'web' nor 'db' services are running"
  exit 1
fi 