#!/bin/bash

# Validate that the nginx-pod is using the nginx image
IMAGE=$(kubectl get pod nginx-pod -n core-concepts -o jsonpath='{.spec.containers[0].image}' 2>/dev/null)

if [[ "$IMAGE" == *"nginx"* ]]; then
    # Pod is using the correct image
    exit 0
else
    # Pod is using a different image
    echo "Pod 'nginx-pod' is not using the nginx image. Found: $IMAGE"
    exit 1
fi 