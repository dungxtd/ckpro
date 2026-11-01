#!/usr/bin/env bash
# Print Markdown release notes for <tag>: the commit subjects between the
# previous tag and <tag>, grouped by conventional-commit type. Housekeeping
# commits (chore, ci, docs, build, style, test, merges) are left out.
#   scripts/release-notes.sh v1.0.10 > notes.md
# Needs full history and tags (actions/checkout with fetch-depth: 0).
set -euo pipefail

TAG="${1:?usage: $0 <tag>}"
PREV="$(git describe --tags --abbrev=0 --match 'v[0-9]*' "${TAG}^" 2>/dev/null || true)"
RANGE="${PREV:+$PREV..}$TAG"

section() { # heading regex
  local lines
  lines="$(git log --no-merges --format=%s "$RANGE" \
    | grep -E "^($2)(\([^)]*\))?!?: " \
    | sed -E 's/^[a-z]+(\(([^)]*)\))?!?: (.*)$/\2|\3/' \
    | awk -F'|' '{ s = $1; t = substr($0, length($1) + 2); if (s == "") print "- " t; else print "- **" s ":** " t }' || true)"
  [[ -n "$lines" ]] && printf '### %s\n\n%s\n\n' "$1" "$lines"
  return 0
}

out="$(section "New" "feat"; section "Fixes" "fix"; section "Performance" "perf"; section "Other changes" "refactor|revert")"
if [[ -z "$out" ]]; then
  out="Maintenance release: dependency and build updates only."
fi
printf '%s\n' "$out"
