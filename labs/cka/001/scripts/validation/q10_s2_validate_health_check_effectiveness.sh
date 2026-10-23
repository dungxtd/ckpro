#!/bin/bash
# Validate health check effectiveness

POD_NAME="health-check"

# Check if pod exists and is running
if ! kubectl get pod $POD_NAME &> /dev/null; then
    echo "❌ Pod '$POD_NAME' not found"
    exit 1
fi

POD_STATUS=$(kubectl get pod $POD_NAME -o jsonpath='{.status.phase}')
if [ "$POD_STATUS" != "Running" ]; then
    echo "❌ Pod '$POD_NAME' is not running"
    exit 1
fi

# Check liveness probe configuration
LIVENESS_PROBE=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.path}')
LIVENESS_PORT=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].livenessProbe.httpGet.port}')
LIVENESS_DELAY=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].livenessProbe.initialDelaySeconds}')
LIVENESS_PERIOD=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].livenessProbe.periodSeconds}')

if [ "$LIVENESS_PROBE" != "/" ]; then
    echo "❌ Incorrect liveness probe path: $LIVENESS_PROBE"
    exit 1
fi

if [ "$LIVENESS_PORT" != "80" ]; then
    echo "❌ Incorrect liveness probe port: $LIVENESS_PORT"
    exit 1
fi

if [ "$LIVENESS_DELAY" != "5" ]; then
    echo "❌ Incorrect liveness probe initial delay: $LIVENESS_DELAY"
    exit 1
fi

# Check readiness probe configuration
READINESS_PROBE=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].readinessProbe.httpGet.path}')
READINESS_PORT=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].readinessProbe.httpGet.port}')
READINESS_DELAY=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].readinessProbe.initialDelaySeconds}')
READINESS_PERIOD=$(kubectl get pod $POD_NAME -o jsonpath='{.spec.containers[0].readinessProbe.periodSeconds}')

if [ "$READINESS_PROBE" != "/" ]; then
    echo "❌ Incorrect readiness probe path: $READINESS_PROBE"
    exit 1
fi

if [ "$READINESS_PORT" != "80" ]; then
    echo "❌ Incorrect readiness probe port: $READINESS_PORT"
    exit 1
fi

if [ "$READINESS_DELAY" != "5" ]; then
    echo "❌ Incorrect readiness probe initial delay: $READINESS_DELAY"
    exit 1
fi

# Check if health endpoint is responding
POD_IP=$(kubectl get pod $POD_NAME -o jsonpath='{.status.podIP}')
if [ -z "$POD_IP" ]; then
    echo "❌ Pod IP not found"
    exit 1
fi

# Test health endpoint (root path for nginx)
if ! kubectl exec $POD_NAME -- curl -s http://localhost/ | grep -q "Welcome to nginx"; then
    echo "❌ Root endpoint is not responding correctly"
    exit 1
fi
  
# Check if pod has been restarted due to health check failures
RESTARTS=$(kubectl get pod $POD_NAME -o jsonpath='{.status.containerStatuses[0].restartCount}')
if [ "$RESTARTS" -gt 0 ]; then
    echo "❌ Pod has been restarted $RESTARTS times"
    exit 1
fi

# Check if pod is ready
READY=$(kubectl get pod $POD_NAME -o jsonpath='{.status.containerStatuses[0].ready}')
if [ "$READY" != "true" ]; then
    echo "❌ Pod is not ready"
    exit 1
fi

echo "✅ Health checks are correctly configured and working"
exit 0 