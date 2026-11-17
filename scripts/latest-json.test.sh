#!/usr/bin/env bash
# scripts/latest-json.sh on made-up signatures: every platform gets its
# package, Linux has no bare key, the minimum version goes in when set, and
# a release missing a platform (or with two of one) fails.
#   scripts/latest-json.test.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
fail() { echo "✗ $*" >&2; exit 1; }

sign() { printf 'sig-of-%s\n' "$1" > "$WORK/pkg/$1.sig"; }
mkdir -p "$WORK/pkg"
for f in \
  ckpro_macos-arm64_0.4.0.app.tar.gz ckpro_macos-x64_0.4.0.app.tar.gz \
  ckpro_windows-x64_ckpro_0.4.0_x64-setup.exe ckpro_windows-arm64_ckpro_0.4.0_arm64-setup.exe \
  ckpro_linux-x64_ckpro_0.4.0_amd64.AppImage ckpro_linux-x64_ckpro_0.4.0_amd64.deb \
  ckpro_linux-arm64_ckpro_0.4.0_aarch64.AppImage ckpro_linux-arm64_ckpro_0.4.0_arm64.deb; do
  sign "$f"
done
printf '### New\n\n- a week at once\n' > "$WORK/notes.md"
: > "$WORK/minimum"

json="$(MINIMUM_VERSION_FILE="$WORK/minimum" GITHUB_REPOSITORY=o/r "$HERE/latest-json.sh" v0.4.0 "$WORK/pkg" "$WORK/notes.md")"
[[ "$(jq -r .version <<< "$json")" == 0.4.0 ]] || fail "version"
[[ "$(jq -r .notes <<< "$json")" == *"a week at once"* ]] || fail "notes"
[[ "$(jq 'has("minimum_version")' <<< "$json")" == false ]] || fail "no minimum when unset"
[[ "$(jq '.platforms | length' <<< "$json")" == 12 ]] || fail "12 keys"
[[ "$(jq -r '.platforms["linux-x86_64-deb"].url' <<< "$json")" == \
  https://github.com/o/r/releases/download/v0.4.0/ckpro_linux-x64_ckpro_0.4.0_amd64.deb ]] || fail "deb url"
[[ "$(jq -r '.platforms["windows-aarch64-nsis"].signature' <<< "$json")" == \
  sig-of-ckpro_windows-arm64_ckpro_0.4.0_arm64-setup.exe ]] || fail "signature"
[[ "$(jq '.platforms | has("linux-x86_64") or has("linux-aarch64")' <<< "$json")" == false ]] || fail "a bare linux key"

# A minimum version, comments aside
printf '# why\nv0.3.9\n' > "$WORK/minimum"
json="$(MINIMUM_VERSION_FILE="$WORK/minimum" "$HERE/latest-json.sh" v0.4.0 "$WORK/pkg")"
[[ "$(jq -r .minimum_version <<< "$json")" == 0.3.9 ]] || fail "minimum version"
printf 'soon\n' > "$WORK/minimum"
! MINIMUM_VERSION_FILE="$WORK/minimum" "$HERE/latest-json.sh" v0.4.0 "$WORK/pkg" > /dev/null 2>&1 || fail "a minimum that is not a version"
: > "$WORK/minimum"

# A platform missing, or twice
rm "$WORK/pkg/ckpro_linux-arm64_ckpro_0.4.0_arm64.deb.sig"
! MINIMUM_VERSION_FILE="$WORK/minimum" "$HERE/latest-json.sh" v0.4.0 "$WORK/pkg" > /dev/null 2>&1 || fail "a missing platform"
sign ckpro_linux-arm64_ckpro_0.4.0_arm64.deb
sign ckpro_linux-arm64_other_0.4.0_arm64.deb
! MINIMUM_VERSION_FILE="$WORK/minimum" "$HERE/latest-json.sh" v0.4.0 "$WORK/pkg" > /dev/null 2>&1 || fail "a platform twice"
! "$HERE/latest-json.sh" main "$WORK/pkg" > /dev/null 2>&1 || fail "not a version tag"

echo "✓ latest.json"
