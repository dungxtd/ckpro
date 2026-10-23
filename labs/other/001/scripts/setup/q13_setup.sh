#!/bin/bash
# Setup script for Question 13: Docker troubleshooting

# Create directory for output
mkdir -p /tmp/exam/q13

# Remove any existing container
docker rm -f broken-container &> /dev/null

# Create a simple app that expects a config file
mkdir -p /tmp/exam/q13/app
cat > /tmp/exam/q13/app/app.js << EOF
const fs = require('fs');
const http = require('http');

// Try to read the config file
try {
  const config = JSON.parse(fs.readFileSync('/app/config.json', 'utf8'));
  console.log('Config loaded successfully:', config);
  
  // Create a simple HTTP server
  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('App is running correctly with config: ' + JSON.stringify(config));
  });
  
  server.listen(3000, () => {
    console.log('Server running on port 3000');
  });
} catch (error) {
  console.error('ERROR: Failed to load config file:', error.message);
  console.error('The application requires a valid /app/config.json file to run');
  process.exit(1);
}
EOF

# Create Dockerfile
cat > /tmp/exam/q13/app/Dockerfile << EOF
FROM node:14-alpine
WORKDIR /app
COPY app.js .
# Deliberately missing config.json
CMD ["node", "app.js"]
EOF

# Build and run the broken container
docker build -t broken-app:latest /tmp/exam/q13/app
docker run -d --name broken-container broken-app:latest

# Clean up
rm -rf /tmp/exam/q13/app

echo "Setup for Question 13 complete."
exit 0 