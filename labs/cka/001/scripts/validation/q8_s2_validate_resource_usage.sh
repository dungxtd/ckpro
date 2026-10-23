#!/bin/bash
# Validate resource usage and limits

NAMESPACE="monitoring"
POD_NAME="resource-pod"

# Check if pod exists and is running
if ! kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null; then
    echo "❌ Pod '$POD_NAME' not found"
    exit 1
fi

POD_STATUS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
    echo "❌ Pod '$POD_NAME' is not running"
    exit 1
fi

# Check resource requests
CPU_REQUEST=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].resources.requests.cpu}')
MEMORY_REQUEST=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].resources.requests.memory}')

if [ "$CPU_REQUEST" != "100m" ]; then
    echo "❌ Incorrect CPU request: $CPU_REQUEST (expected: 100m)"
    exit 1
fi

if [ "$MEMORY_REQUEST" != "128Mi" ]; then
    echo "❌ Incorrect memory request: $MEMORY_REQUEST (expected: 128Mi)"
    exit 1
fi

# Check resource limits
CPU_LIMIT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].resources.limits.cpu}')
MEMORY_LIMIT=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].resources.limits.memory}')

if [ "$CPU_LIMIT" != "200m" ]; then
    echo "❌ Incorrect CPU limit: $CPU_LIMIT (expected: 200m)"
    exit 1
fi

if [ "$MEMORY_LIMIT" != "256Mi" ]; then
    echo "❌ Incorrect memory limit: $MEMORY_LIMIT (expected: 256Mi)"
    exit 1
fi

# Check actual resource usage
CPU_USAGE=$(kubectl top pod $POD_NAME -n $NAMESPACE --no-headers | awk '{print $2}')
MEMORY_USAGE=$(kubectl top pod $POD_NAME -n $NAMESPACE --no-headers | awk '{print $3}')

# Convert CPU usage to millicores for comparison
CPU_MILLICORES=$(echo $CPU_USAGE | sed 's/m//')
if [ "$CPU_MILLICORES" -gt 200 ]; then
    echo "❌ CPU usage exceeds limit: $CPU_USAGE"
    exit 1
fi

# Convert memory usage to Mi for comparison
MEMORY_MI=$(echo $MEMORY_USAGE | sed 's/Mi//')
if [ "$MEMORY_MI" -gt 256 ]; then
    echo "❌ Memory usage exceeds limit: $MEMORY_USAGE"
    exit 1
fi

# Check if pod has been restarted due to resource issues
RESTARTS=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].restartCount}')
if [ "$RESTARTS" -gt 0 ]; then
    echo "❌ Pod has been restarted $RESTARTS times"
    exit 1
fi

echo "✅ Resource configuration and usage are correct"
exit 0 