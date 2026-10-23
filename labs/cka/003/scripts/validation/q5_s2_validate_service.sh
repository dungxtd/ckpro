#!/bin/bash
set -e

kubectl get service front-end-svc -n default || {
    echo "Service front-end-svc not found in namespace default"
    exit 1
}

SVC_TYPE=$(kubectl get service front-end-svc -n default -o jsonpath='{.spec.type}')
if [[ "$SVC_TYPE" != "NodePort" ]]; then
    echo "Service type is not NodePort (got '$SVC_TYPE')"
    exit 1
fi

TARGET_PORT=$(kubectl get service front-end-svc -n default -o jsonpath='{.spec.ports[0].targetPort}')
if [[ "$TARGET_PORT" != "http" ]]; then
    echo "Service targetPort does not reference named port 'http' (got '$TARGET_PORT')"
    exit 1
fi

SELECTOR_APP=$(kubectl get service front-end-svc -n default -o jsonpath='{.spec.selector.app}')
DEPLOY_LABEL=$(kubectl get deployment front-end -n default -o jsonpath='{.spec.template.metadata.labels.app}')
if [[ -z "$SELECTOR_APP" || "$SELECTOR_APP" != "$DEPLOY_LABEL" ]]; then
    echo "Service selector does not match front-end pod labels (selector.app='$SELECTOR_APP', pod label app='$DEPLOY_LABEL')"
    exit 1
fi

# Confirm the service actually has endpoints (selector really matches running pods)
ENDPOINT_COUNT=$(kubectl get endpoints front-end-svc -n default -o jsonpath='{.subsets[*].addresses[*].ip}' | wc -w)
if [[ "$ENDPOINT_COUNT" -lt 1 ]]; then
    echo "Service front-end-svc has no endpoints - selector likely does not match any front-end pod"
    exit 1
fi

echo "front-end-svc validation successful"
exit 0
