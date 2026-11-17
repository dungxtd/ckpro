#!/usr/bin/env bash
# Print latest.json, what the app's updater reads, for release <tag>: each
# platform's package and its signature, from the signatures in <dir> (the
# release's *.sig, named as their packages are, plus .sig: ckpro_<version>_
# <label>, as the release workflow names them). Every platform
# CKPro ships must be there, once: a missing one fails, rather than a
# release that leaves some computers without updates.
#   scripts/latest-json.sh v0.4.0 pkg [notes.md] > latest.json
# The repo comes from GITHUB_REPOSITORY (dungxtd/ckpro if unset); the
# release's minimum version, if any, from .github/release/minimum-version.
# Needs jq.
set -euo pipefail

TAG="${1:?usage: $0 <tag> <dir> [notes.md]}"
DIR="${2:?usage: $0 <tag> <dir> [notes.md]}"
NOTES="${3:-}"
REPO="${GITHUB_REPOSITORY:-dungxtd/ckpro}"
VERSION="${TAG#v}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MINIMUM_FILE="${MINIMUM_VERSION_FILE:-$ROOT/.github/release/minimum-version}"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a version tag: $TAG" >&2; exit 1; }

# The one package matching <pattern> in DIR (its signature beside it)
package() {
  local found=() f
  for f in "$DIR"/$1.sig; do [[ -f "$f" ]] && found+=("$f"); done
  if [[ ${#found[@]} -ne 1 ]]; then
    echo "expected one signed package for $1, found ${#found[@]}" >&2
    exit 1
  fi
  basename "${found[0]}" .sig
}

# Each updater key, the package it gets. Linux has no bare key: a copy that
# is neither the AppImage nor the .deb (built from source) gets nothing
# rather than an AppImage over itself
declare -a KEYS=(
  "darwin-aarch64 *_macos-arm64.app.tar.gz"
  "darwin-aarch64-app *_macos-arm64.app.tar.gz"
  "darwin-x86_64 *_macos-x64.app.tar.gz"
  "darwin-x86_64-app *_macos-x64.app.tar.gz"
  "windows-x86_64 *_windows-x64-setup.exe"
  "windows-x86_64-nsis *_windows-x64-setup.exe"
  "windows-aarch64 *_windows-arm64-setup.exe"
  "windows-aarch64-nsis *_windows-arm64-setup.exe"
  "linux-x86_64-appimage *_linux-x64.AppImage"
  "linux-x86_64-deb *_linux-x64.deb"
  "linux-aarch64-appimage *_linux-arm64.AppImage"
  "linux-aarch64-deb *_linux-arm64.deb"
)

platforms='{}'
for entry in "${KEYS[@]}"; do
  key="${entry%% *}"
  pattern="${entry#* }"
  file="$(package "$pattern")"
  url="https://github.com/$REPO/releases/download/$TAG/$file"
  signature="$(tr -d '\n' < "$DIR/$file.sig")"
  platforms="$(jq --arg k "$key" --arg u "$url" --arg s "$signature" '. + {($k): {url: $u, signature: $s}}' <<< "$platforms")"
done

minimum="$( { grep -v '^[[:space:]]*#' "$MINIMUM_FILE" 2>/dev/null || true; } | tr -d '[:space:]')"
minimum="${minimum#v}"
if [[ -n "$minimum" && ! "$minimum" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "minimum version is not a version: $minimum" >&2
  exit 1
fi

notes=""
[[ -n "$NOTES" ]] && notes="$(cat "$NOTES")"

jq -n \
  --arg version "$VERSION" \
  --arg notes "$notes" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg minimum "$minimum" \
  --argjson platforms "$platforms" \
  '{version: $version, notes: $notes, pub_date: $date, platforms: $platforms}
   + (if $minimum == "" then {} else {minimum_version: $minimum} end)'
