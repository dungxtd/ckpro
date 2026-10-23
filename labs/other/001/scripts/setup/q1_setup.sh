#!/bin/bash
# Setup script for Question 1: Docker image creation

# Create necessary directories
mkdir -p /tmp/exam/q1

# Create a simple Dockerfile
cat > /tmp/exam/q1/Dockerfile << EOF
FROM alpine:latest
WORKDIR /app
COPY hello.sh .
RUN chmod +x hello.sh
CMD ["./hello.sh"]
EOF

# Create the hello script
cat > /tmp/exam/q1/hello.sh << EOF
#!/bin/sh
echo "Hello from Docker Speed Run!"
EOF

# Make it executable
chmod +x /tmp/exam/q1/hello.sh

echo "Setup for Question 1 complete."
exit 0 