#!/bin/bash
# Validate that CIS Benchmark remediation has been applied

# List of critical CIS checks that must be fixed
CRITICAL_CHECKS=("1.1.1" "1.1.9" "1.1.13" "1.2.5" "1.2.13" "1.3.2" "1.4.2")
RESULTS_FILE="/tmp/kube-bench-results.txt"
REMEDIATION_DOC="/tmp/remediation-applied.txt"

# Check if results file exists
if [ ! -f "$RESULTS_FILE" ]; then
  echo "❌ CIS Benchmark results file not found at $RESULTS_FILE"
  exit 1
fi

# Check if remediation document exists
if [ ! -f "$REMEDIATION_DOC" ]; then
  echo "❌ Remediation documentation not found at $REMEDIATION_DOC"
  exit 1
fi

# Check if at least 3 critical checks have been fixed
FIXED_COUNT=0
for check in "${CRITICAL_CHECKS[@]}"; do
  # Look for check ID in remediation doc
  if grep -q "$check" "$REMEDIATION_DOC"; then
    FIXED_COUNT=$((FIXED_COUNT + 1))
  fi
done

if [ $FIXED_COUNT -lt 3 ]; then
  echo "❌ Not enough critical CIS checks have been remediated (found $FIXED_COUNT, need at least 3)"
  exit 1
fi

# Check for actual system changes that would indicate remediation
# For example, check file permissions on critical files
ETCD_KEY="/etc/kubernetes/pki/etcd/server.key"
if [ -f "$ETCD_KEY" ]; then
  PERM=$(stat -c "%a" "$ETCD_KEY")
  if [ "$PERM" == "600" ]; then
    echo "✓ etcd server key has correct permissions"
  fi
fi

# Check kubelet configuration for authorization mode
KUBELET_CONFIG="/etc/kubernetes/kubelet.conf"
if [ -f "$KUBELET_CONFIG" ]; then
  if grep -q "authorization-mode=Webhook" "$KUBELET_CONFIG"; then
    echo "✓ kubelet has secure authorization mode"
  fi
fi

# Check kubelet service file for security parameters
KUBELET_SERVICE="/etc/systemd/system/kubelet.service.d/10-kubeadm.conf"
if [ -f "$KUBELET_SERVICE" ]; then
  if grep -q "protect-kernel-defaults=true" "$KUBELET_SERVICE"; then
    echo "✓ kubelet has kernel defaults protection enabled"
  fi
fi

echo "✅ CIS Benchmark remediation has been applied for at least $FIXED_COUNT critical checks"
exit 0 