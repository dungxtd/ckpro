# The release workflow rewrites `version` and the `sha256` lines inside
# `on_arm` / `on_intel` after each release; keep this structure.
cask "ckpro" do
  version "0.0.0"

  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_macos-arm64_ckpro_#{version}_aarch64.dmg"
  end

  on_intel do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_macos-x64_ckpro_#{version}_x64.dmg"
  end

  name "CK --dry-run"
  desc "Practice the CKA, CKAD and CKS exams on local Kubernetes clusters"
  homepage "https://github.com/dungxtd/ckpro"

  depends_on macos: :big_sur

  app "ckpro.app"

  # Ad-hoc signed (no Developer ID or notarization yet): Gatekeeper would
  # refuse it as damaged on first open, so the quarantine flag goes on install
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/ckpro.app"]
  end

  # The app's database, kubeconfigs and logs; its Docker containers stay
  # (remove them with `docker compose -p ckpro down`)
  zap trash: [
    "~/Library/Application Support/dev.ckpro.app",
    "~/Library/Caches/dev.ckpro.app",
    "~/Library/Logs/dev.ckpro.app",
    "~/Library/Preferences/dev.ckpro.app.plist",
    "~/Library/WebKit/dev.ckpro.app",
  ]
end
