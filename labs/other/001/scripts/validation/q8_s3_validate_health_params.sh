#!/bin/bash
# Validate script for Question 8, Step 3: Check if health check parameters are correct

# Check if the container exists
docker inspect healthy-app &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'healthy-app' does not exist"
  exit 1
fi

# Get health check parameters
health_check=$(docker inspect --format='{{json .Config.Healthcheck}}' healthy-app)

# Check for required parameters
if [[ $health_check == *"30000000000"* ]]; then  # 30s in nanoseconds
  echo "✅ Health check interval is set to 30s"
else
  echo "❌ Health check interval is not set to 30s"
  exit 1
fi

if [[ $health_check == *"10000000000"* ]]; then  # 10s in nanoseconds
  echo "✅ Health check timeout is set to 10s"
else
  echo "❌ Health check timeout is not set to 10s"
  exit 1
fi

if [[ $health_check == *"5000000000"* ]]; then  # 5s in nanoseconds
  echo "✅ Health check start period is set to 5s"
else
  echo "❌ Health check start period is not set to 5s"
  exit 1
fi

if [[ $health_check == *"\"Retries\":3"* ]]; then
  echo "✅ Health check retries is set to 3"
else
  echo "❌ Health check retries is not set to 3"
  exit 1
fi

# If we got here, all checks passed
echo "✅ All health check parameters are set correctly"
exit 0 