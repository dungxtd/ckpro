#!/bin/bash
# Validate that runtime security tool (Falco) is installed

# Check if Falco is installed
if ! command -v falco &> /dev/null; then
  echo "❌ Falco not found on the system"
  exit 1
fi

# Check if Falco service is active
FALCO_SERVICE=$(systemctl is-active falco 2>/dev/null)
if [ "$FALCO_SERVICE" != "active" ]; then
  echo "❌ Falco service is not active"
  exit 1
fi

# Check if Falco module is loaded
if ! lsmod | grep -q "falco"; then
  echo "❌ Falco kernel module is not loaded"
  exit 1
fi

# Check if Falco config file exists
if [ ! -f "/etc/falco/falco.yaml" ]; then
  echo "❌ Falco config file not found"
  exit 1
fi

# Check if custom rules file exists
if [ ! -f "/etc/falco/falco_rules.local.yaml" ] && [ ! -f "/etc/falco/rules.d/custom_rules.yaml" ]; then
  echo "❌ No custom Falco rules found"
  exit 1
fi

# Check if rules contain expected content
CUSTOM_RULES=$(find /etc/falco -name "*.yaml" -type f -exec grep -l "rule:" {} \;)
if [ -z "$CUSTOM_RULES" ]; then
  echo "❌ No valid Falco rules found"
  exit 1
fi

# Check if at least one rule detects suspicious activity
SUSPICIOUS_RULES=$(find /etc/falco -name "*.yaml" -type f -exec grep -l "suspicious\|attack\|anomaly\|malicious" {} \;)
if [ -z "$SUSPICIOUS_RULES" ]; then
  echo "❌ No rules for detecting suspicious activity found"
  exit 1
fi

echo "✅ Runtime security tool (Falco) is installed and configured"
exit 0