# The release workflow rewrites `version` and the `sha256` lines inside
# `on_arm` / `on_intel` after each release; keep this structure.
cask "cktry" do
  version "0.0.0"

  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_macos-arm64_cktry_#{version}_aarch64.dmg"
  end

  on_intel do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_macos-x64_cktry_#{version}_x64.dmg"
  end

  name "CK Try"
  desc "Practice the CKA, CKAD and CKS exams on local Kubernetes clusters"
  homepage "https://github.com/dungxtd/cktry"

  depends_on macos: :big_sur

  app "cktry.app"

  # Ad-hoc signed (no Developer ID or notarization yet): Gatekeeper would
  # refuse it as damaged on first open, so the quarantine flag goes on install
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/cktry.app"]
  end

  # The app's database, kubeconfigs and logs; its Docker containers stay
  # (remove them with `docker compose -p cktry down`)
  zap trash: [
    "~/Library/Application Support/dev.cktry.app",
    "~/Library/Caches/dev.cktry.app",
    "~/Library/Logs/dev.cktry.app",
    "~/Library/Preferences/dev.cktry.app.plist",
    "~/Library/WebKit/dev.cktry.app",
  ]
end
