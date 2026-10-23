#!/bin/bash
# Validate that image scanning script exists and runs correctly

SCAN_SCRIPT="/usr/local/bin/scan-images.sh"
TEST_IMAGE="nginx:latest"

# Check if the scan script exists
if [ ! -f "$SCAN_SCRIPT" ]; then
  echo "❌ Image scanning script not found at $SCAN_SCRIPT"
  exit 1
fi

# Check if the script is executable
if [ ! -x "$SCAN_SCRIPT" ]; then
  echo "❌ Image scanning script is not executable"
  exit 1
fi

# Check if the script uses Trivy
if ! grep -q "trivy" "$SCAN_SCRIPT"; then
  echo "❌ Image scanning script doesn't use Trivy scanner"
  exit 1
fi

# Check if the script can scan an image
echo "Testing scan script..."
$SCAN_SCRIPT $TEST_IMAGE &> /dev/null
if [ $? -ne 0 ]; then
  echo "❌ Image scanning script failed to scan $TEST_IMAGE"
  exit 1
fi

# Check if the script outputs vulnerabilities
OUTPUT=$($SCAN_SCRIPT $TEST_IMAGE 2>&1)
if ! echo "$OUTPUT" | grep -q "VULNERABILITY" && ! echo "$OUTPUT" | grep -q "CVE-" && ! echo "$OUTPUT" | grep -q "vulnerabilit"; then
  echo "❌ Image scanning script doesn't output vulnerability information"
  exit 1
fi

# Check if the script filters by severity
if ! grep -q "HIGH\|CRITICAL" "$SCAN_SCRIPT"; then
  echo "❌ Image scanning script doesn't filter vulnerabilities by severity"
  exit 1
fi

echo "✅ Image scanning script exists and runs correctly"
exit 0 