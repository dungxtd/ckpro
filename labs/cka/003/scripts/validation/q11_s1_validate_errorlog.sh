#!/bin/bash
set -e

FILE=/tmp/exam/foo-errors.log

# Pod foo logs continuously; give the candidate's extraction some tolerance/retry window
WAIT_COUNT=0
while [ $WAIT_COUNT -lt 60 ]; do
    if [[ -s "$FILE" ]]; then
        break
    fi
    WAIT_COUNT=$((WAIT_COUNT+5))
    sleep 5
done

if [[ ! -s "$FILE" ]]; then
    echo "File $FILE is missing or empty"
    exit 1
fi

# Every non-empty line must contain the literal string "error file-not-found" (no false positives)
NON_EMPTY_BAD=$(grep -v "error file-not-found" "$FILE" | grep -c -v '^[[:space:]]*$' || true)
if [[ "$NON_EMPTY_BAD" -gt 0 ]]; then
    echo "File $FILE contains lines that do not match 'error file-not-found'"
    exit 1
fi

MATCH_COUNT=$(grep -c "error file-not-found" "$FILE" || true)
if [[ "$MATCH_COUNT" -lt 1 ]]; then
    echo "File $FILE has no lines matching 'error file-not-found'"
    exit 1
fi

# Sanity check at least one such line genuinely appears in the pod's own logs
kubectl logs foo -n logging 2>/dev/null | grep -q "error file-not-found" || {
    echo "Pod foo logs do not contain 'error file-not-found' - cannot cross-validate extraction"
    exit 1
}

echo "foo-errors.log validation successful"
exit 0
