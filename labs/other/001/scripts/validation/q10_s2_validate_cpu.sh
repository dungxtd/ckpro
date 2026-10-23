#!/bin/bash
# Validate script for Question 10, Step 2: Check if CPU limit is set correctly

# Check if the container exists
docker inspect limited-resources &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Container 'limited-resources' does not exist"
  exit 1
fi

# Get the CPU limit (NanoCPUs is in billionths of a CPU, so 0.5 CPU = 500000000)
nano_cpus=$(docker inspect --format='{{.HostConfig.NanoCpus}}' limited-resources)
cpus=$(echo "scale=2; $nano_cpus / 1000000000" | bc)

# Check if it's set to 0.5 CPU
if (( $(echo "$cpus >= 0.49 && $cpus <= 0.51" | bc -l) )); then
  echo "✅ Container CPU limit is set correctly: $cpus CPUs"
  exit 0
else
  echo "❌ Container CPU limit is not set to 0.5 CPUs: $cpus CPUs"
  exit 1
fi 