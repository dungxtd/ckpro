#!/bin/bash
# Setup for Question 15: Supply Chain Security

# Create namespace if it doesn't exist
kubectl create namespace supply-chain 2>/dev/null || true

# Create a ConfigMap with information about trusted registries
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: registry-info
  namespace: supply-chain
data:
  registry-info.txt: |
    Common Container Registries:
    - docker.io/library/ - Official Docker Hub images
    - k8s.gcr.io/ - Kubernetes project images
    - gcr.io/distroless/ - Google distroless images
    - quay.io/ - Red Hat Quay registry
    
    Admission Control Options for Registry Restriction:
    - ImagePolicyWebhook
    - OPA Gatekeeper
    - Kyverno
    
    Each registry may have a different structure and trust model. Make sure to verify image signatures and digests.
EOF

# Create a ConfigMap with a sample SBOM (Software Bill of Materials)
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: sample-sbom
  namespace: supply-chain
data:
  sbom.json: |
    {
      "bomFormat": "CycloneDX",
      "specVersion": "1.4",
      "version": 1,
      "metadata": {
        "timestamp": "2023-04-20T11:33:31Z",
        "component": {
          "type": "application",
          "name": "example-app",
          "version": "1.0.0"
        }
      },
      "components": [
        {
          "type": "library",
          "name": "nginx",
          "version": "1.21.6",
          "purl": "pkg:deb/debian/nginx@1.21.6?arch=x86_64"
        },
        {
          "type": "library",
          "name": "openssl",
          "version": "3.0.2",
          "purl": "pkg:deb/debian/openssl@3.0.2?arch=x86_64"
        }
      ]
    }
EOF

echo "Setup completed for Question 15"
exit 0 