#!/bin/bash
# Setup script for Question 12: Docker image analysis

# Create directory for output
mkdir -p /tmp/exam/q12

# Create a sample webapp image if not already available
if ! docker inspect webapp:latest &> /dev/null; then
    # Create a temp directory
    mkdir -p /tmp/exam/q12/webapp
    
    # Create a simple webapp
    cat > /tmp/exam/q12/webapp/Dockerfile << EOF
FROM node:14-alpine
WORKDIR /app
COPY . .
RUN npm install
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
EOF
    
    # Create a package.json
    cat > /tmp/exam/q12/webapp/package.json << EOF
{
  "name": "webapp",
  "version": "1.0.0",
  "description": "Sample web application",
  "main": "index.js",
  "dependencies": {
    "express": "^4.17.1"
  }
}
EOF
    
    # Create index.js
    cat > /tmp/exam/q12/webapp/index.js << EOF
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from the sample webapp!');
});

app.listen(port, () => {
  console.log(\`App listening at http://localhost:\${port}\`);
});
EOF
    
    # Build the image
    docker build -t webapp:latest /tmp/exam/q12/webapp
    
    # Clean up
    rm -rf /tmp/exam/q12/webapp
fi

echo "Setup for Question 12 complete."
exit 0 