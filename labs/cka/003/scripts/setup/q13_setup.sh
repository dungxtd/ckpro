#!/bin/bash
set -e

kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Enable metrics-server if not present
kubectl get deployment metrics-server -n kube-system || {
  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
  kubectl wait --for=condition=available --timeout=180s deployment/metrics-server -n kube-system
}

# Three pods with the same label but deliberately different CPU load, so
# `kubectl top pod` values differ meaningfully once metrics populate.
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: overloaded-cpu-low
  namespace: monitoring
  labels:
    name: overloaded-cpu
spec:
  containers:
    - name: burner
      image: busybox:1.36
      command: ["sh", "-c", "yes > /dev/null & sleep 3600"]
      resources:
        requests:
          cpu: 50m
        limits:
          cpu: 200m
---
apiVersion: v1
kind: Pod
metadata:
  name: overloaded-cpu-medium
  namespace: monitoring
  labels:
    name: overloaded-cpu
spec:
  containers:
    - name: burner
      image: busybox:1.36
      command: ["sh", "-c", "yes > /dev/null & yes > /dev/null & sleep 3600"]
      resources:
        requests:
          cpu: 50m
        limits:
          cpu: 400m
---
apiVersion: v1
kind: Pod
metadata:
  name: overloaded-cpu-high
  namespace: monitoring
  labels:
    name: overloaded-cpu
spec:
  containers:
    - name: burner
      image: busybox:1.36
      command: ["sh", "-c", "yes > /dev/null & yes > /dev/null & yes > /dev/null & yes > /dev/null & sleep 3600"]
      resources:
        requests:
          cpu: 50m
        limits:
          cpu: 800m
EOF

mkdir -p /tmp/exam
touch /tmp/exam/top-cpu-pod.txt

echo "Waiting for overloaded-cpu pods to be running..."
kubectl wait --for=condition=Ready --timeout=120s pod -l name=overloaded-cpu -n monitoring || {
  echo "WARNING: not all overloaded-cpu pods ready in time, continuing anyway"
}

echo "Setup completed for Question 13"
