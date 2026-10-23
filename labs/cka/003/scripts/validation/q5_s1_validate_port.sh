#!/bin/bash
set -e

kubectl get deployment front-end -n default || {
    echo "Deployment front-end not found in namespace default"
    exit 1
}

PORT_NAME=$(kubectl get deployment front-end -n default -o jsonpath='{.spec.template.spec.containers[?(@.name=="nginx")].ports[?(@.containerPort==80)].name}')
if [[ "$PORT_NAME" != "http" ]]; then
    echo "nginx container does not have a port named 'http' on 80/TCP (got name='$PORT_NAME')"
    exit 1
fi

PROTOCOL=$(kubectl get deployment front-end -n default -o jsonpath='{.spec.template.spec.containers[?(@.name=="nginx")].ports[?(@.containerPort==80)].protocol}')
if [[ -n "$PROTOCOL" && "$PROTOCOL" != "TCP" ]]; then
    echo "Port 80 protocol is not TCP (got '$PROTOCOL')"
    exit 1
fi

echo "front-end container port validation successful"
exit 0
