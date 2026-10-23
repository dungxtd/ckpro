# Docker Speed Run - Core Concepts: Solutions

## Question 1: Create and tag a Docker image

**Task**: Create a Docker image named `docker-speedrun:v1` using the provided Dockerfile and tag it as `docker-speedrun:latest`.

**Solution**:
```bash
# Navigate to the directory containing the Dockerfile
cd /tmp/exam/q1

# Build the image with the tag docker-speedrun:v1
docker build -t docker-speedrun:v1 .

# Tag the image as docker-speedrun:latest
docker tag docker-speedrun:v1 docker-speedrun:latest

# Verify the images exist
docker images | grep docker-speedrun
```

## Question 2: Run a container with specific parameters

**Task**: Run a container using nginx:alpine with specific parameters.

**Solution**:
```bash
docker run -d --name web-server -p 8080:80 -e NGINX_HOST=localhost nginx:alpine

# Verify the container is running
docker ps | grep web-server

# Verify environment variable
docker exec web-server env | grep NGINX_HOST
```

## Question 3: Create and use a Docker volume

**Task**: Create a Docker volume and use it in a container to persist data.

**Solution**:
```bash
# Create the volume
docker volume create data-volume

# Run a container that mounts the volume and creates a file
docker run --name volume-test -v data-volume:/app/data alpine:latest sh -c "mkdir -p /app/data && echo 'Docker volumes test' > /app/data/test.txt"

# Verify the data was persisted
docker run --rm -v data-volume:/app/data alpine:latest cat /app/data/test.txt
```

## Question 4: Create a multi-stage Dockerfile

**Task**: Create a multi-stage Dockerfile to build a Go application with a minimal final image.

**Solution**:
```
FROM golang:1.17-alpine AS builder
WORKDIR /app
COPY /tmp/exam/q4/main.go .
RUN go build -o app .

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/app .
ENTRYPOINT ["./app"]
```

Build command:
```bash
cd /tmp/exam/q4
docker build -t multi-stage:latest .
```

## Question 5: Configure Docker daemon with systemd cgroup driver

**Task**: Configure the Docker daemon to use the systemd cgroup driver.

**Solution**:
```bash
# Create or edit the daemon.json file
cat > /etc/docker/daemon.json << EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2"
}
EOF

# Restart Docker service
systemctl restart docker

# Verify the configuration
docker info | grep -i cgroup
```

## Question 6: Configure container logging

**Task**: Run a container with specific logging configuration.

**Solution**:
```bash
docker run -d --name logging-test \
  --log-driver json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  nginx:alpine

# Verify logging configuration
docker inspect logging-test --format '{{.HostConfig.LogConfig}}'
```

## Question 7: Create a custom network and use container DNS

**Task**: Create a custom bridge network and test container DNS resolution.

**Solution**:
```bash
# Create the custom network
docker network create --subnet=172.18.0.0/16 app-network

# Run the first container in detached mode
docker run -d --name app1 --network app-network alpine sleep 1000

# Run the second container to ping the first one
docker run --name app2 --network app-network alpine ping -c 3 app1

# Verify the containers used the correct network
docker network inspect app-network
```

## Question 8: Implement Docker healthchecks

**Task**: Create a Dockerfile with healthcheck for a web application.

**Solution**:
```
FROM nginx:alpine

# Install curl for the healthcheck
RUN apk add --no-cache curl

# Configure the healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

Build and run command:
```bash
cd /tmp/exam/q8
docker build -t healthy-nginx .
docker run -d --name healthy-app healthy-nginx

# Check health status
docker inspect --format='{{.State.Health.Status}}' healthy-app
```

## Question 9: Work with OCI image manifests

**Task**: Pull and analyze an image manifest.

**Solution**:
```bash
# Pull the image
docker pull nginx:1.21.0

# Get the image manifest and save to file
mkdir -p /tmp/exam/q9
docker manifest inspect nginx:1.21.0 > /tmp/exam/q9/manifest.json

# Extract platforms information
cat /tmp/exam/q9/manifest.json | grep -A 10 "platform" | grep "architecture\|os" | sort | uniq > /tmp/exam/q9/platforms.txt
```

## Question 10: Set container resource limits

**Task**: Run a container with CPU and memory limits.

**Solution**:
```bash
docker run -d --name limited-resources \
  --cpus=0.5 \
  --memory=256m \
  stress --cpu 1

# Verify the limits
docker inspect limited-resources --format '{{.HostConfig.NanoCpus}}'
docker inspect limited-resources --format '{{.HostConfig.Memory}}'
```

## Question 11: Create a Docker Compose configuration

**Task**: Create a Docker Compose file for a web and database application.

**Solution**:
```yaml
version: '3'

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    networks:
      - app-network
    depends_on:
      - db

  db:
    image: postgres:13
    environment:
      - POSTGRES_USER=dbuser
      - POSTGRES_PASSWORD=dbpassword
      - POSTGRES_DB=myapp
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  db-data:
```

Start services:
```bash
cd /tmp/exam/q11
docker-compose up -d
```

## Question 12: Analyze a Docker image

**Task**: Analyze and report on an existing Docker image.

**Solution**:
```bash
mkdir -p /tmp/exam/q12

# Pull the image if not already available
docker pull webapp:latest

# Analyze the image and create the report
cat > /tmp/exam/q12/image-report.txt << EOF
Base Image: $(docker inspect webapp:latest --format '{{.Config.Image}}')
Number of Layers: $(docker history webapp:latest | wc -l)
Exposed Ports: $(docker inspect webapp:latest --format '{{.Config.ExposedPorts}}')
Environment Variables: $(docker inspect webapp:latest --format '{{.Config.Env}}')
Entrypoint: $(docker inspect webapp:latest --format '{{.Config.Entrypoint}}')
EOF
```

## Question 13: Troubleshoot a container

**Task**: Fix an issue with a broken container.

**Solution**:
```bash
mkdir -p /tmp/exam/q13

# Check container logs
docker logs broken-container > /tmp/exam/q13/container-logs.txt

# Examine the container
docker exec -it broken-container ls -la /app

# Fix the issue by creating the missing file
docker exec -it broken-container sh -c 'echo "{\"config\": \"fixed\"}" > /app/config.json'

# Document the diagnosis
cat > /tmp/exam/q13/diagnosis.txt << EOF
Issue: The container was missing a required configuration file at /app/config.json
Symptoms: Container was failing to start properly due to missing configuration
Solution: Created the missing config.json file with basic configuration
EOF
```

## Question 14: Create a Docker container with non-root user

**Task**: Create a Dockerfile that runs as a non-root user for improved security.

**Solution**:
```
FROM python:3.9-slim

# Create a non-root user
RUN useradd -u 1001 -m appuser

# Set the working directory
WORKDIR /app

# Copy the application code
COPY /tmp/exam/q14/app.py .

# Change ownership to the non-root user
RUN chown -R appuser:appuser /app

# Switch to the non-root user
USER appuser

# Set the entrypoint
ENTRYPOINT ["python", "app.py"]
```

Build and run:
```bash
cd /tmp/exam/q14
docker build -t secure-app .
docker run -d --name secure-app secure-app

# Verify the user
docker exec secure-app whoami
```

## Question 15: Optimize a Dockerfile

**Task**: Optimize an existing Dockerfile for better build performance and smaller size.

**Solution**:

Creating a .dockerignore file:
```
.git
node_modules
npm-debug.log
Dockerfile
.dockerignore
*.md
*.log
```

Optimized Dockerfile:
```
FROM node:14-alpine

WORKDIR /app

# Copy package files first to leverage caching
COPY package*.json ./
RUN npm install --production

# Then copy application code
COPY . .

# Use multi-stage build to create smaller final image
FROM node:14-alpine
WORKDIR /app
COPY --from=0 /app/node_modules ./node_modules
COPY --from=0 /app/package.json ./
COPY --from=0 /app/src ./src

# Combine multiple commands to reduce layers
ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Use exec form of CMD
CMD ["node", "src/index.js"]
```

Build command:
```bash
cd /tmp/exam/q15
docker build -t optimized-app:latest .
```

## Question 16: Docker Content Trust

**Task**: Configure and use Docker Content Trust for image signing.

**Solution**:
```bash
# Commands saved to file
cat > /tmp/exam/q16/dct-commands.sh << EOF
#!/bin/bash

# Enable Docker Content Trust
export DOCKER_CONTENT_TRUST=1

# Pull a signed image
docker pull docker.io/library/alpine:latest

# Configure passphrase for signing
export DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE="my-secure-passphrase"

# Build and push a signed image to local registry
docker build -t localhost:5000/secure-app:latest .
docker push localhost:5000/secure-app:latest
EOF

# Make the file executable
chmod +x /tmp/exam/q16/dct-commands.sh
``` 