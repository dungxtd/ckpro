# The release workflow rewrites `version` and the `sha256` lines inside
# `on_arm` / `on_intel` after each release; keep this structure.
cask "ckdry" do
  version "0.0.0"

  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/ckdry/releases/download/v#{version}/ckdry_macos-arm64_ckdry_#{version}_aarch64.dmg"
  end

  on_intel do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/ckdry/releases/download/v#{version}/ckdry_macos-x64_ckdry_#{version}_x64.dmg"
  end

  name "CK --dry-run"
  desc "Practice the CKA, CKAD and CKS exams on local Kubernetes clusters"
  homepage "https://github.com/dungxtd/ckdry"

  depends_on macos: :big_sur

  app "ckdry.app"

  # Ad-hoc signed (no Developer ID or notarization yet): Gatekeeper would
  # refuse it as damaged on first open, so the quarantine flag goes on install
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/ckdry.app"]
  end

  # The app's database, kubeconfigs and logs; its Docker containers stay
  # (remove them with `docker compose -p ckdry down`)
  zap trash: [
    "~/Library/Application Support/dev.ckdry.app",
    "~/Library/Caches/dev.ckdry.app",
    "~/Library/Logs/dev.ckdry.app",
    "~/Library/Preferences/dev.ckdry.app.plist",
    "~/Library/WebKit/dev.ckdry.app",
  ]
end
