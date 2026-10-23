#!/bin/bash
# Setup script for Question 15: Docker image optimization

# Create directory for app files
mkdir -p /tmp/exam/q15

# Create an unoptimized Dockerfile
cat > /tmp/exam/q15/Dockerfile << EOF
FROM node:14

# Install dependencies separately (not optimal)
RUN npm install -g nodemon
RUN npm install -g pm2
RUN npm install -g yarn

# Create app directory
WORKDIR /app

# Copy everything (not optimal)
COPY . .

# Install dependencies (not optimal)
RUN npm install 

# Multiple ENV statements (not optimal)
ENV NODE_ENV=development
ENV PORT=3000
ENV DEBUG=true
ENV LOG_LEVEL=debug

# Expose port
EXPOSE 3000

# Run command
CMD ["npm", "start"]
EOF

# Create package.json
cat > /tmp/exam/q15/package.json << EOF
{
  "name": "unoptimized-app",
  "version": "1.0.0",
  "description": "Unoptimized Docker app",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "morgan": "^1.10.0",
    "body-parser": "^1.19.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^2.0.12",
    "jest": "^27.0.6",
    "eslint": "^7.32.0"
  }
}
EOF

# Create source code
mkdir -p /tmp/exam/q15/src
cat > /tmp/exam/q15/src/index.js << EOF
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from the unoptimized app!');
});

app.listen(port, () => {
  console.log(\`App listening at http://localhost:\${port}\`);
});
EOF

# Create some unnecessary files to ignore
cat > /tmp/exam/q15/README.md << EOF
# Unoptimized App

This is a sample app that needs Docker optimization.
EOF

mkdir -p /tmp/exam/q15/tests
cat > /tmp/exam/q15/tests/test.js << EOF
console.log('This is a test file that should be excluded from the image');
EOF

mkdir -p /tmp/exam/q15/logs
cat > /tmp/exam/q15/logs/app.log << EOF
Sample log entry that should be excluded from the image
EOF

# Remove any existing image
docker rmi optimized-app:latest &> /dev/null

echo "Setup for Question 15 complete."
exit 0 