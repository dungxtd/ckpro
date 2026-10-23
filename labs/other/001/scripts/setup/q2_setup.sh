#!/bin/bash
# Setup script for Question 2: Docker container with port mapping and environment variables

# Ensure nginx:alpine image is available
docker pull nginx:alpine &> /dev/null

# Remove any existing container with the same name
docker rm -f web-server &> /dev/null

echo "Setup for Question 2 complete."
exit 0 