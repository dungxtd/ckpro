#!/bin/bash
set -e

kubectl create namespace logging --dry-run=client -o yaml | kubectl apply -f -

# Existing single-container pod writing to /var/log/big-corp-app.log via an emptyDir
# volume mounted at /var/log. The candidate must add a "sidecar" container (pods
# can't have containers added live, so they will need to delete+recreate this pod).
# NOTE: heredoc delimiter is quoted ('EOF') so $(date) below is NOT expanded by
# this setup script - it must stay literal so busybox evaluates it fresh on
# every loop iteration inside the container, not once here.
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: big-corp-app
  namespace: logging
  labels:
    app: big-corp-app
spec:
  containers:
    - name: count
      image: busybox:1.36
      command:
        - "sh"
        - "-c"
        - |
          while true; do
            echo "$(date) big-corp-app log line" >> /var/log/big-corp-app.log
            sleep 2
          done
      volumeMounts:
        - name: varlog
          mountPath: /var/log
  volumes:
    - name: varlog
      emptyDir: {}
EOF

echo "Waiting for pod big-corp-app to be running..."
kubectl wait --for=condition=Ready --timeout=90s pod/big-corp-app -n logging || {
  echo "WARNING: pod big-corp-app not ready in time, continuing anyway"
}

echo "Setup completed for Question 12"
