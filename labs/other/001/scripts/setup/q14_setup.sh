#!/bin/bash
# Setup script for Question 14: Docker non-root user

# Create directory for app files
mkdir -p /tmp/exam/q14

# Create a simple Python app
cat > /tmp/exam/q14/app.py << EOF
#!/usr/bin/env python3
import os
import time

print("Starting secure application...")
print(f"Running as user: {os.getuid()}")

# Display user information
try:
    import pwd
    user_info = pwd.getpwuid(os.getuid())
    print(f"Username: {user_info.pw_name}")
    print(f"User ID: {user_info.pw_uid}")
    print(f"Group ID: {user_info.pw_gid}")
    print(f"Home directory: {user_info.pw_dir}")
except Exception as e:
    print(f"Could not get detailed user info: {e}")

print("Application is running securely.")

# Keep container running for inspection
print("Container will exit in 30 seconds...")
time.sleep(30)
EOF

# Remove any existing container or image
docker rm -f secure-app &> /dev/null
docker rmi secure-app &> /dev/null

echo "Setup for Question 14 complete."
exit 0 