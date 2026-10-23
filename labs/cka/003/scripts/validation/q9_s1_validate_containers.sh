#!/bin/bash
set -e

kubectl get pod kucc8 -n multi-container || {
    echo "Pod kucc8 not found in namespace multi-container"
    exit 1
}

POD=$(kubectl get pod kucc8 -n multi-container -o json)

COUNT=$(echo "$POD" | jq '.spec.containers | length')
if [[ "$COUNT" != "2" ]]; then
    echo "Pod kucc8 does not have exactly 2 containers (got $COUNT)"
    exit 1
fi

NGINX_IMAGE=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="nginx") | .image')
if [[ -z "$NGINX_IMAGE" || "$NGINX_IMAGE" != *"nginx"* ]]; then
    echo "Container 'nginx' missing or not using nginx image (got '$NGINX_IMAGE')"
    exit 1
fi

CONSUL_IMAGE=$(echo "$POD" | jq -r '.spec.containers[] | select(.name=="consul") | .image')
if [[ "$CONSUL_IMAGE" != "hashicorp/consul:1.15" ]]; then
    echo "Container 'consul' missing or not using image hashicorp/consul:1.15 (got '$CONSUL_IMAGE')"
    exit 1
fi

echo "kucc8 container validation successful"
exit 0
