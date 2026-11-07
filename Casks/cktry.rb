# The release workflow rewrites `version` and the four `sha256` values (by
# their keys) after each release; keep this structure.
cask "cktry" do
  version "0.1.0"
  sha256 arm:          "421396db949303b5d1e86ccf9daff40935d7ee822cb3fc3d5a48c512d26c53c5",
         intel:        "d63fd3445acd0a4a335277fbdc429296257c2d0d2b210348bcd537b1c81717d9",
         arm64_linux:  "a6b72bc97c136740c340705606c589db091df78631249bcb3dd87f7e996f6971",
         x86_64_linux: "067d539cadb4b8673ddfc33834d67bf121caa8b25b1ce6fffa53f141b775bf09"

  on_macos do
    on_arm do
      url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_macos-arm64_CKtry_#{version}_aarch64.dmg"
    end
    on_intel do
      url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_macos-x64_CKtry_#{version}_x64.dmg"
    end


    app "CKtry.app"

    # Ad-hoc signed (no Developer ID or notarization yet): Gatekeeper would
    # refuse it as damaged on first open, so the quarantine flag goes on install
    postflight do
      system_command "/usr/bin/xattr",
                     args: ["-dr", "com.apple.quarantine", "#{appdir}/CKtry.app"]
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
  on_linux do
    on_arm do
      url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_linux-arm64_CKtry_#{version}_aarch64.AppImage"

      app_image "cktry_linux-arm64_CKtry_#{version}_aarch64.AppImage", target: "CKtry.AppImage"
    end
    on_intel do
      url "https://github.com/dungxtd/cktry/releases/download/v#{version}/cktry_linux-x64_CKtry_#{version}_amd64.AppImage"

      app_image "cktry_linux-x64_CKtry_#{version}_amd64.AppImage", target: "CKtry.AppImage"
    end

    # The app's database, kubeconfigs and logs; its Docker containers stay
    zap trash: [
      "~/.cache/dev.cktry.app",
      "~/.config/dev.cktry.app",
      "~/.local/share/dev.cktry.app",
    ]
  end

  name "CKtry"
  desc "Practice the CKA, CKAD and CKS exams on local Kubernetes clusters"
  homepage "https://github.com/dungxtd/cktry"
end
