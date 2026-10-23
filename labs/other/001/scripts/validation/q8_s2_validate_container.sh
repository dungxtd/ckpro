#!/bin/bash
# Validate script for Question 8, Step 2: Check if container is running with health check

# Check if the container exists and is running
docker inspect healthy-app &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'healthy-app' does not exist"
  exit 1
fi

# Check if it's running
running=$(docker inspect --format='{{.State.Running}}' healthy-app)

if [ "$running" != "true" ]; then
  echo "❌ Container 'healthy-app' exists but is not running"
  exit 1
fi

# Check if health check is configured
health_check=$(docker inspect --format='{{.Config.Healthcheck}}' healthy-app)

if [ -z "$health_check" ]; then
  echo "❌ Container 'healthy-app' is running but has no health check configured"
  exit 1
else
  echo "✅ Container 'healthy-app' is running with health check: $health_check"
  exit 0
fi 