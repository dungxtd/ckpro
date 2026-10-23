#!/bin/bash
set -e

kubectl create namespace logging --dry-run=client -o yaml | kubectl apply -f -

mkdir -p /tmp/exam
touch /tmp/exam/foo-errors.log

# Existing pod that periodically logs a mix of matching and non-matching lines.
# NOTE: heredoc delimiter is quoted ('EOF') so $(date)/$((...)) below are NOT
# expanded by this setup script - they must stay literal so busybox evaluates
# them fresh on every loop iteration inside the container, not once here.
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: foo
  namespace: logging
  labels:
    app: foo
spec:
  containers:
    - name: foo
      image: busybox:1.36
      command:
        - "sh"
        - "-c"
        - |
          i=0
          while true; do
            i=$((i+1))
            if [ $((i % 2)) -eq 0 ]; then
              echo "$(date) error file-not-found"
            else
              echo "$(date) INFO ok"
            fi
            sleep 2
          done
EOF

echo "Waiting for pod foo to be running..."
kubectl wait --for=condition=Ready --timeout=90s pod/foo -n logging || {
  echo "WARNING: pod foo not ready in time, continuing anyway"
}

echo "Setup completed for Question 11"
