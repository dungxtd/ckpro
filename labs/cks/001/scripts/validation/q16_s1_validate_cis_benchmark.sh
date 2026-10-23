#!/bin/bash
# Validate that CIS Benchmark scan has been run

KUBE_BENCH_PATH="/usr/local/bin/kube-bench"
RESULTS_FILE="/tmp/kube-bench-results.txt"

# Check if kube-bench is installed
if [ ! -f "$KUBE_BENCH_PATH" ]; then
  echo "❌ kube-bench not found at $KUBE_BENCH_PATH"
  exit 1
fi

# Check if results file exists (indicating a scan was run)
if [ ! -f "$RESULTS_FILE" ]; then
  echo "❌ CIS Benchmark results file not found at $RESULTS_FILE"
  exit 1
fi

# Check if results file has content
if [ ! -s "$RESULTS_FILE" ]; then
  echo "❌ CIS Benchmark results file is empty"
  exit 1
fi

# Check if the file contains expected benchmark output
if ! grep -q "Kubernetes CIS Benchmark" "$RESULTS_FILE" && ! grep -q "FAIL\|PASS\|WARN" "$RESULTS_FILE"; then
  echo "❌ Results file doesn't contain valid CIS Benchmark results"
  exit 1
fi

# Check if file has results for critical security controls
if ! grep -q "1.1\|1.2\|2.1\|3.1\|4.1" "$RESULTS_FILE"; then
  echo "❌ Results file doesn't include critical controls check results"
  exit 1
fi

echo "✅ CIS Benchmark scan has been run and results recorded"
exit 0 