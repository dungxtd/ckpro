#!/bin/bash
# Setup for Question 18: Audit Logging

# Create namespace if it doesn't exist
kubectl create namespace audit-logging 2>/dev/null || true

# Create a ConfigMap with information about audit logging
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: audit-logging-info
  namespace: audit-logging
data:
  audit-levels.txt: |
    Kubernetes Audit Logging Levels:
    
    1. None: Don't log events matching this rule.
    2. Metadata: Log request metadata (user, timestamp, resource, verb, etc.) but not request or response body.
    3. Request: Log event metadata and request body but not response body. Not applicable for non-mutating requests.
    4. RequestResponse: Log event metadata, request, and response bodies. Not applicable for non-mutating requests.
    
    Example Audit Policy:
    ```yaml
    apiVersion: audit.k8s.io/v1
    kind: Policy
    rules:
    - level: Metadata
      userGroups: ["system:authenticated", "system:unauthenticated"]
    
    - level: None
      users: ["system:kube-proxy"]
      verbs: ["watch"]
      resources:
        - group: "" # core
          resources: ["endpoints", "services", "services/status"]
    
    - level: RequestResponse
      resources:
        - group: "" # core
          resources: ["pods"]
      verbs: ["create", "update", "patch", "delete"]
    ```
EOF

# Create a ServiceAccount for the audit viewer
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: audit-viewer-sa
  namespace: audit-logging
EOF

# Create a Role for viewing audit logs
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: audit-viewer-role
  namespace: audit-logging
rules:
- apiGroups: [""]
  resources: ["pods", "configmaps"]
  verbs: ["get", "list"]
EOF

# Create a RoleBinding for the ServiceAccount
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: audit-viewer-binding
  namespace: audit-logging
subjects:
- kind: ServiceAccount
  name: audit-viewer-sa
  namespace: audit-logging
roleRef:
  kind: Role
  name: audit-viewer-role
  apiGroup: rbac.authorization.k8s.io
EOF

echo "Setup completed for Question 18"
exit 0 