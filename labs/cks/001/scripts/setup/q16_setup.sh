#!/bin/bash
# Setup for Question 16: Static Analysis

# Create namespace if it doesn't exist
kubectl create namespace static-analysis 2>/dev/null || true

# Create a ConfigMap with information about static analysis tools
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: static-analysis-info
  namespace: static-analysis
data:
  tools.txt: |
    Kubernetes Static Analysis Tools:
    
    - kubesec: Security risk analysis for Kubernetes resources
    - kube-score: Static code analysis of Kubernetes object definitions
    - conftest: Write tests against structured configuration data
    - KubeLinter: Static analysis tool for Kubernetes YAML
    - Checkov: Static code analysis tool for infrastructure-as-code
    - Terrascan: Static code analyzer for Infrastructure as Code
    
    Common security issues detected:
    - Privileged containers
    - Containers running as root
    - Resources with no CPU/memory limits
    - Containers with dangerous capabilities
    - Missing network policies
    - Exposed secrets
EOF

# Create a ConfigMap with an insecure deployment for analysis
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: insecure-deployment
  namespace: static-analysis
data:
  deployment.yaml: |
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: insecure-app
      namespace: static-analysis
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: insecure-app
      template:
        metadata:
          labels:
            app: insecure-app
        spec:
          containers:
          - name: app
            image: nginx:latest
            securityContext:
              privileged: true
              runAsUser: 0
            env:
            - name: DB_PASSWORD
              value: "super-secret-password"
EOF

echo "Setup completed for Question 16"
exit 0 