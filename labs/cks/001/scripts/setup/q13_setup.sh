#!/bin/bash
# Setup for Question 13: Multi-Tenancy Isolation

# Create a ConfigMap with information about multi-tenancy in Kubernetes
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: multi-tenancy-info
  namespace: default
data:
  multi-tenancy.txt: |
    Kubernetes Multi-Tenancy Options:
    
    1. Namespace-based multi-tenancy:
       - Uses namespaces to separate workloads
       - Combine with ResourceQuotas and NetworkPolicies
       - Limitations: shared control plane, weaker isolation
    
    2. Cluster-based multi-tenancy:
       - Separate clusters for each tenant
       - Stronger isolation but more resource overhead
    
    3. Virtual Cluster multi-tenancy:
       - Virtual clusters within physical clusters
       - Balance between isolation and resource efficiency
    
    Common Multi-Tenancy Controls:
    - ResourceQuotas: Limit resource consumption
    - LimitRanges: Set default resource constraints
    - NetworkPolicies: Isolate network traffic
    - RBAC: Control access permissions
    - PodSecurityStandards: Restrict pod security context
EOF

# Create some existing namespaces for reference
kubectl create namespace tenant-existing 2>/dev/null || true

echo "Setup completed for Question 13"
exit 0 