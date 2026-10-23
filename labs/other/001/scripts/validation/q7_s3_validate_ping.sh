#!/bin/bash
# Validate script for Question 7, Step 3: Check if app2 successfully pinged app1

# Check if app2 container was created
docker inspect app2 &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'app2' does not exist"
  exit 1
fi

# Check if app2 container has completed
status=$(docker inspect --format='{{.State.Status}}' app2)

if [[ "$status" != "exited" ]]; then
  echo "❌ Container 'app2' has not completed its task (status: $status)"
  exit 1
fi

# Check exit code (0 means success)
exit_code=$(docker inspect --format='{{.State.ExitCode}}' app2)

if [[ "$exit_code" == "0" ]]; then
  # Get logs to confirm ping was successful
  logs=$(docker logs app2 2>&1)
  
  if [[ $logs == *"bytes from"* && $logs == *"app1"* ]]; then
    echo "✅ Container 'app2' successfully pinged 'app1'"
    exit 0
  else
    echo "❌ Container 'app2' completed but logs don't show successful ping to 'app1'"
    echo "Logs: $logs"
    exit 1
  fi
else
  echo "❌ Container 'app2' exited with non-zero code: $exit_code"
  echo "Logs: $(docker logs app2 2>&1)"
  exit 1
fi 