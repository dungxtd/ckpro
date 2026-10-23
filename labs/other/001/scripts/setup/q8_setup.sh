#!/bin/bash
# Setup script for Question 8: Docker healthchecks

# Create directory for Dockerfile
mkdir -p /tmp/exam/q8

# Remove any existing container and image
docker rm -f healthy-app &> /dev/null
docker rmi healthy-nginx &> /dev/null

# Ensure nginx:alpine image is available
docker pull nginx:alpine &> /dev/null

echo "Setup for Question 8 complete."
exit 0 