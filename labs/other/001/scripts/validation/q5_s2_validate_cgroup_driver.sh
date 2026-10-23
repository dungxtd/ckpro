#!/bin/bash
# Validate script for Question 5, Step 2: Check if Docker service is running with systemd cgroup driver

# Check if Docker service is running
systemctl is-active docker &> /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Docker service is not running"
  exit 1
fi

# Check for systemd cgroup driver in Docker info
docker info | grep -q "Cgroup Driver: systemd"

if [ $? -eq 0 ]; then
  echo "✅ Docker service is running with systemd cgroup driver"
  exit 0
else
  echo "❌ Docker service is not using systemd cgroup driver"
  echo "Current configuration:"
  docker info | grep "Cgroup Driver"
  exit 1
fi 