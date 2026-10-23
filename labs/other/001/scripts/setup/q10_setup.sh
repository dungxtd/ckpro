#!/bin/bash
# Setup script for Question 10: Container resource limits

# Remove any existing container with the same name
docker rm -f limited-resources &> /dev/null

# Pull the stress image
docker pull progrium/stress:latest &> /dev/null || docker pull polinux/stress:latest &> /dev/null

# If neither of the stress images are available, create a simple stress image
if [ $? -ne 0 ]; then
    mkdir -p /tmp/exam/q10
    cat > /tmp/exam/q10/Dockerfile << EOF
FROM alpine:latest
RUN apk add --no-cache stress-ng
ENTRYPOINT ["stress-ng"]
EOF
    docker build -t stress:latest /tmp/exam/q10
fi

echo "Setup for Question 10 complete."
exit 0 