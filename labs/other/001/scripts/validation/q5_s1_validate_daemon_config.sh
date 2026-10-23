#!/bin/bash
# Validate script for Question 5, Step 1: Check if Docker daemon configuration has correct settings

# Check if daemon.json exists
if [ ! -f /etc/docker/daemon.json ]; then
  echo "❌ Docker daemon configuration file does not exist at /etc/docker/daemon.json"
  exit 1
fi

# Check for systemd cgroup driver in the configuration
grep -q "native.cgroupdriver=systemd" /etc/docker/daemon.json

if [ $? -eq 0 ]; then
  echo "✅ Docker daemon is configured with systemd cgroup driver"
  exit 0
else
  echo "❌ Docker daemon is not configured with systemd cgroup driver"
  echo "Current configuration:"
  cat /etc/docker/daemon.json
  exit 1
fi 