#!/bin/bash
# Validate that security analysis is stored in ConfigMap

NAMESPACE="static-analysis"
SOURCE_CM="insecure-deployment"
ANALYSIS_CM="security-analysis"

# Check if namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Namespace '$NAMESPACE' not found"
  exit 1
fi

# Check if source ConfigMap exists
kubectl get configmap $SOURCE_CM -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Source ConfigMap '$SOURCE_CM' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if analysis ConfigMap exists
kubectl get configmap $ANALYSIS_CM -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Analysis ConfigMap '$ANALYSIS_CM' not found in namespace '$NAMESPACE'"
  exit 1
fi

# Check if analysis ConfigMap has content
ANALYSIS_DATA=$(kubectl get configmap $ANALYSIS_CM -n $NAMESPACE -o jsonpath='{.data}')
if [ -z "$ANALYSIS_DATA" ]; then
  echo "❌ Analysis ConfigMap doesn't have any data"
  exit 1
fi

# Check if analysis contains kubesec results
if ! echo "$ANALYSIS_DATA" | grep -q "kubesec\|CRITICAL\|score\|pass\|fail"; then
  echo "❌ Analysis doesn't contain kubesec results"
  exit 1
fi

# Check if analysis identifies security issues
if ! echo "$ANALYSIS_DATA" | grep -q "securityContext\|privilege\|capability\|hostPath\|runAsNonRoot\|readOnlyRootFilesystem"; then
  echo "❌ Analysis doesn't identify common security issues"
  exit 1
fi

echo "✅ Security analysis is stored in ConfigMap"
exit 0 