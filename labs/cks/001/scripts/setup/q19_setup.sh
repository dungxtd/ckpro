#!/bin/bash
# Setup for Question 19: Malicious Activity Detection

# Create namespace if it doesn't exist
kubectl create namespace malicious-detection 2>/dev/null || true

# Create a ConfigMap with information about threat detection
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: threat-detection-info
  namespace: malicious-detection
data:
  threats.txt: |
    Common Kubernetes Threats:
    
    1. Unusual Network Patterns:
       - Connections to suspicious IPs/domains
       - Unusual ports/protocols
       - Excessive outbound traffic
       - DNS exfiltration
    
    2. Crypto Mining Indicators:
       - High CPU usage for extended periods
       - Connections to mining pools
       - Mining software signatures
       - Abnormal resource consumption patterns
    
    3. Privilege Escalation:
       - Container breakouts
       - Access to sensitive host paths
       - Unusual process spawning
       - Modification of system binaries
       - Usage of sensitive capabilities
  
  incident-response.txt: |
    Incident Response Steps:
    
    1. Isolation:
       - Apply network policies to isolate compromised pods
       - Prevent lateral movement
    
    2. Investigation:
       - Capture pod logs and system information
       - Analyze runtime behavior
       - Identify the attack vector
    
    3. Remediation:
       - Terminate compromised pods
       - Update security policies
       - Patch vulnerabilities
       - Harden configurations
EOF

# Create a sample pod with suspicious activity for demonstration
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: suspicious-pod
  namespace: malicious-detection
  labels:
    activity: suspicious
spec:
  containers:
  - name: suspicious
    image: ubuntu:latest
    command: ["sleep", "3600"]
EOF

echo "Setup completed for Question 19"
exit 0 