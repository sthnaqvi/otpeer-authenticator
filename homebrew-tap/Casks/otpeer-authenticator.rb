cask "otpeer-authenticator" do
  arch arm: "arm64", intel: "x64"

  version "0.1.1"
  sha256 arm:   "46febe47539048814e8096d92bf0d6533a735e60121849914dc106a30f178696",
         intel: "8fb2e37be388e775d1ceafbeccf10b0d8adb2f287d977de12221cb3a84bf1363"

  url "https://github.com/sthnaqvi/otpeer-authenticator/releases/download/desktop-v#{version}/OTPeer-Authenticator-#{version}-#{arch}.dmg",
      verified: "github.com/sthnaqvi/otpeer-authenticator/"
  name "OTPeer Authenticator"
  desc "Two-factor authenticator with an encrypted local vault and peer-to-peer sync"
  homepage "https://otpeer.com/"

  livecheck do
    url :url
    strategy :github_latest
    regex(/^desktop[._-]v?(\d+(?:\.\d+)+)$/i)
  end

  # Not `auto_updates true`: the app ships electron-updater, but Squirrel.Mac
  # refuses to apply updates to an unsigned bundle, so Homebrew owns upgrades
  # until the build is Developer ID signed.
  depends_on macos: :monterey

  app "OTPeer Authenticator.app"

  zap trash: [
    "~/Library/Application Support/OTPeer Authenticator",
    "~/Library/Logs/OTPeer Authenticator",
    "~/Library/Preferences/app.otpeer.desktop.plist",
    "~/Library/Saved Application State/app.otpeer.desktop.savedState",
  ]

  caveats do
    <<~EOS
      OTPeer Authenticator is not yet signed with an Apple Developer ID, so
      Gatekeeper quarantines it and the first launch may claim the app is
      "damaged". That message is quarantine, not a corrupt download.

      Either install without quarantine:

        brew install --cask --no-quarantine otpeer-authenticator

      or clear it after a normal install:

        xattr -cr "/Applications/OTPeer Authenticator.app"

    EOS
  end
end
