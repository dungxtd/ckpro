#!/bin/bash
# Validate that the pod runs as the correct user and group

POD_NAME="secure-container"
NAMESPACE="os-hardening"
REQUIRED_USER_ID=1000
REQUIRED_GROUP_ID=3000

# Check if pod exists
kubectl get pod $POD_NAME -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Pod '$POD_NAME' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if pod runs as the correct user
RUN_AS_USER=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.runAsUser}')
if [ "$RUN_AS_USER" != "$REQUIRED_USER_ID" ]; then
  echo "❌ Pod does not run as user ID $REQUIRED_USER_ID (actual: $RUN_AS_USER)"
  exit 1
fi

# Check if pod runs as the correct group
RUN_AS_GROUP=$(kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.spec.containers[0].securityContext.runAsGroup}')
if [ "$RUN_AS_GROUP" != "$REQUIRED_GROUP_ID" ]; then
  echo "❌ Pod does not run as group ID $REQUIRED_GROUP_ID (actual: $RUN_AS_GROUP)"
  exit 1
fi

echo "✅ Pod runs as user ID $REQUIRED_USER_ID and group ID $REQUIRED_GROUP_ID"
exit 0 