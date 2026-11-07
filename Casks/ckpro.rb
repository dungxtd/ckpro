# The release workflow rewrites `version` and the four `sha256` values (by
# their keys) after each release; keep this structure.
cask "ckpro" do
  version "0.1.0"
  sha256 arm:          "421396db949303b5d1e86ccf9daff40935d7ee822cb3fc3d5a48c512d26c53c5",
         intel:        "d63fd3445acd0a4a335277fbdc429296257c2d0d2b210348bcd537b1c81717d9",
         arm64_linux:  "a6b72bc97c136740c340705606c589db091df78631249bcb3dd87f7e996f6971",
         x86_64_linux: "067d539cadb4b8673ddfc33834d67bf121caa8b25b1ce6fffa53f141b775bf09"

  on_macos do
    on_arm do
      url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_macos-arm64_ckpro_#{version}_aarch64.dmg"
    end
    on_intel do
      url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_macos-x64_ckpro_#{version}_x64.dmg"
    end


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
  on_linux do
    on_arm do
      url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_linux-arm64_ckpro_#{version}_aarch64.AppImage"

      app_image "ckpro_linux-arm64_ckpro_#{version}_aarch64.AppImage", target: "ckpro.AppImage"
    end
    on_intel do
      url "https://github.com/dungxtd/ckpro/releases/download/v#{version}/ckpro_linux-x64_ckpro_#{version}_amd64.AppImage"

      app_image "ckpro_linux-x64_ckpro_#{version}_amd64.AppImage", target: "ckpro.AppImage"
    end

    # The app's database, kubeconfigs and logs; its Docker containers stay
    zap trash: [
      "~/.cache/dev.ckpro.app",
      "~/.config/dev.ckpro.app",
      "~/.local/share/dev.ckpro.app",
    ]
  end

  name "ckpro"
  desc "Practice the CKA, CKAD and CKS exams on local Kubernetes clusters"
  homepage "https://github.com/dungxtd/ckpro"
end
