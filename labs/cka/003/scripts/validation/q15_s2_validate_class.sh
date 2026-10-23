#!/bin/bash
set -e

ING=$(kubectl get ingress pong -n ing-internal -o json)

CLASS_NAME=$(echo "$ING" | jq -r '.spec.ingressClassName // empty')
CLASS_ANNOTATION=$(echo "$ING" | jq -r '.metadata.annotations["kubernetes.io/ingress.class"] // empty')

if [[ "$CLASS_NAME" != "nginx" && "$CLASS_ANNOTATION" != "nginx" ]]; then
    echo "Ingress pong is not using the nginx ingress class (ingressClassName='$CLASS_NAME', annotation='$CLASS_ANNOTATION')"
    exit 1
fi

echo "Ingress class validation successful"
exit 0
