#!/usr/bin/env bash
# Release ckpro: set the version everywhere, commit, tag and push; the
# release workflow builds, publishes and points the Homebrew cask.
#
#   scripts/release.sh X.Y.Z           # a new version
#   scripts/release.sh X.Y.Z --redo    # that version again, from HEAD (its
#                                      # release and tag are replaced)
#   scripts/release.sh X.Y.Z --dry-run # say what it would do, change nothing
#
# It refuses unless the tree is clean, on main, level with origin/main, and
# CI passed on HEAD. Needs git, gh (signed in), cargo and perl.
set -euo pipefail

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
shift
REDO=false DRY=false
for arg in "$@"; do
  case "$arg" in
    --redo) REDO=true ;;
    --dry-run) DRY=true ;;
    *) usage ;;
  esac
done
TAG="v$VERSION"
cd "$(git rev-parse --show-toplevel)"

say() { printf '\033[1m›\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }
run() { if $DRY; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

# The files that carry the version
FILES=(package.json desktop/package.json desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml desktop/src-tauri/Cargo.lock)
current() { sed -n 's/^version = "\(.*\)"/\1/p' desktop/src-tauri/Cargo.toml | head -n 1; }

say "Checking the tree"
[[ -z "$(git status --porcelain)" ]] || fail "uncommitted changes: commit or stash them first"
[[ "$(git branch --show-current)" == main ]] || fail "not on main"
git fetch -q origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "main is not level with origin/main: push or pull first"

say "Checking CI on $(git rev-parse --short HEAD)"
ci="$(gh run list --branch main --workflow CI --commit "$(git rev-parse HEAD)" --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"')"
[[ "$ci" == "completed success" ]] || fail "CI on HEAD is '${ci:-not found}': wait for it to pass"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
  $REDO || fail "$TAG exists: pass --redo to release it again from HEAD"
  say "Replacing the release and tag $TAG"
  run gh release delete "$TAG" --cleanup-tag --yes || true
  run git tag -d "$TAG" 2>/dev/null || true
elif $REDO; then
  fail "$TAG does not exist yet: drop --redo"
fi

if [[ "$(current)" != "$VERSION" ]]; then
  say "Setting the version $(current) → $VERSION"
  if ! $DRY; then
    perl -0pi -e "s/\"version\": \"[0-9.]+\"/\"version\": \"$VERSION\"/" package.json desktop/package.json desktop/src-tauri/tauri.conf.json
    perl -0pi -e "s/^version = \"[0-9.]+\"/version = \"$VERSION\"/m" desktop/src-tauri/Cargo.toml
    (cd desktop/src-tauri && cargo update -p ckpro --offline -q)
    git add "${FILES[@]}"
    git diff --cached --stat
  fi
  run git commit -q -m "chore: release $VERSION"
fi

say "Tagging $TAG and pushing"
run git tag -a "$TAG" -m "ckpro $VERSION"
run git push -q origin main "$TAG"

if ! $DRY; then
  sleep 8
  url="$(gh run list --workflow release.yml --limit 1 --json url --jq '.[0].url')"
  say "Building: $url"
  echo "  Release notes, as they will read:"
  scripts/release-notes.sh "$TAG" | sed 's/^/    /' | head -40
fi
