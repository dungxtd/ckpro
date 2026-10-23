#!/bin/bash
# Setup script for Question 4: Multi-stage Docker build

# Create necessary directories
mkdir -p /tmp/exam/q4

# Create a simple Go application
cat > /tmp/exam/q4/main.go << EOF
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from Multi-Stage Docker Build!")
	})

	fmt.Println("Server starting on port 8080...")
	http.ListenAndServe(":8080", nil)
}
EOF

# Remove any existing image with the same name
docker rmi multi-stage:latest &> /dev/null

echo "Setup for Question 4 complete."
exit 0 