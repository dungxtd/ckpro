#!/bin/bash
# Setup script for Question 11: Docker Compose

# Create directory for docker-compose file
mkdir -p /tmp/exam/q11

# Ensure docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Installing docker-compose..."
    curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Pull required images
docker pull nginx:alpine &> /dev/null
docker pull postgres:13 &> /dev/null

# Stop any existing containers from previous runs
docker-compose -f /tmp/exam/q11/docker-compose.yml down &> /dev/null

echo "Setup for Question 11 complete."
exit 0 