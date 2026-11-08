# The release workflow rewrites `version` and the four `sha256` values (by
# their keys) after each release; keep this structure.
cask "ckpro" do
  version "0.2.0"
  sha256 arm:          "b49844a35481609ac9515eeb890b0bae6237c4360026fbe65f41f89a1ff053a1",
         intel:        "86f90715983e894147757aef3b2dff8c706fff18bf0d84dfbc6e4a1da7263e93",
         arm64_linux:  "2290f653ed35980cce4f88ac48247d481cef9b586232f1e0fa09a8b5b9d3f6a3",
         x86_64_linux: "e461863c1060b768481980ec16faca63045a00058a7cb25cc4d89ec08b554115"

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
