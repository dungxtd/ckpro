#!/bin/bash
# Setup script for Question 3: Docker volumes

# Remove any existing volume with the same name
docker volume rm data-volume &> /dev/null

# Remove any existing container with the same name
docker rm -f volume-test &> /dev/null

# Pull the alpine image
docker pull alpine:latest &> /dev/null

echo "Setup for Question 3 complete."
exit 0 