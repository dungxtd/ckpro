#!/bin/bash
# Validate that cluster has been securely upgraded

MIN_VERSION="1.24.0"
UPGRADE_PLAN_FILE="/tmp/upgrade-plan.txt"
BACKUP_DIR="/etc/kubernetes/backup"

# Check current Kubernetes version
CURRENT_VERSION=$(kubectl version --short | grep "Server" | cut -d " " -f 3 | sed 's/v//')
if [ -z "$CURRENT_VERSION" ]; then
  echo "❌ Could not determine Kubernetes version"
  exit 1
fi

# Function to compare versions
version_lt() {
  [ "$(echo "$@" | tr " " "\n" | sort -V | head -n 1)" != "$1" ]
}

# Check if current version meets the minimum requirement
if version_lt "$CURRENT_VERSION" "$MIN_VERSION"; then
  echo "❌ Kubernetes version is too old: $CURRENT_VERSION. Required: at least $MIN_VERSION"
  exit 1
fi

# Check if upgrade plan exists
if [ ! -f "$UPGRADE_PLAN_FILE" ]; then
  echo "❌ Upgrade plan document not found at $UPGRADE_PLAN_FILE"
  exit 1
fi

# Check if the upgrade plan has required sections
if ! grep -q "Pre-upgrade checks" "$UPGRADE_PLAN_FILE" || ! grep -q "Backup" "$UPGRADE_PLAN_FILE" || ! grep -q "Upgrade steps" "$UPGRADE_PLAN_FILE"; then
  echo "❌ Upgrade plan is missing required sections"
  exit 1
fi

# Check if backups were created
if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ Backup directory not found at $BACKUP_DIR"
  exit 1
fi

# Check if critical files were backed up
if [ ! -f "$BACKUP_DIR/admin.conf" ] || [ ! -f "$BACKUP_DIR/pki/ca.crt" ] || [ ! -d "$BACKUP_DIR/manifests" ]; then
  echo "❌ Critical files not found in backup directory"
  exit 1
fi

# Check if all nodes are upgraded to the same version
NODE_VERSIONS=$(kubectl get nodes -o jsonpath='{.items[*].status.nodeInfo.kubeletVersion}')
for version in $NODE_VERSIONS; do
  version=$(echo $version | sed 's/v//')
  if version_lt "$version" "$MIN_VERSION"; then
    echo "❌ Not all nodes are upgraded. Found version: $version"
    exit 1
  fi
done

# Check if control plane components are healthy
CONTROL_PLANE_HEALTH=$(kubectl get pods -n kube-system -l tier=control-plane -o jsonpath='{.items[*].status.phase}')
if [[ "$CONTROL_PLANE_HEALTH" == *"Pending"* ]] || [[ "$CONTROL_PLANE_HEALTH" == *"Failed"* ]]; then
  echo "❌ Some control plane components are not healthy"
  exit 1
fi

echo "✅ Cluster has been securely upgraded to version $CURRENT_VERSION"
exit 0 