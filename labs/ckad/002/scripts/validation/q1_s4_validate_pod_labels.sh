#!/bin/bash

# Validate that the nginx-pod has the correct labels
APP_LABEL=$(kubectl get pod nginx-pod -n core-concepts -o jsonpath='{.metadata.labels.app}' 2>/dev/null)
ENV_LABEL=$(kubectl get pod nginx-pod -n core-concepts -o jsonpath='{.metadata.labels.env}' 2>/dev/null)

if [[ "$APP_LABEL" == "web" && "$ENV_LABEL" == "prod" ]]; then
    # Pod has the correct labels
    exit 0
else
    # Pod has incorrect or missing labels
    echo "Pod 'nginx-pod' does not have the correct labels. Found app=$APP_LABEL, env=$ENV_LABEL. Expected app=web, env=prod"
    exit 1
fi 