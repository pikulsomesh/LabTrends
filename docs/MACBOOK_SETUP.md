# MacBook Air setup: continue LabTrends Phase 0

Run these on the MacBook Air, in order.

## 1. Toolchain (once)

```bash
brew install node@22 git gh
brew install --cask zulu@17 android-studio
```

If Homebrew isn't installed, get it from brew.sh first. Then open Android Studio once and finish the setup wizard so it downloads the SDK.

## 2. Shell environment (once)

```bash
printf '\nexport JAVA_HOME=$(/usr/libexec/java_home -v 17)\nexport ANDROID_HOME=$HOME/Library/Android/sdk\nexport PATH=$PATH:$ANDROID_HOME/platform-tools\n' >> ~/.zshrc && source ~/.zshrc
```

## 3. GitHub login and clone

```bash
gh auth login
```

Choose GitHub.com, HTTPS and the browser login, as before.

```bash
git clone https://github.com/pikulsomesh/LabTrends.git && cd LabTrends && npm install && npm test
```

You should see 16 tests pass.

## 4. Phone

Plug in the Pixel and approve the USB debugging prompt for this Mac.

```bash
adb devices
```

It should list the phone as `device`. The test files from `Download/labtrends-test` are still on the phone.

## 5. Build and run (the first build takes about 17 minutes)

```bash
npx expo run:android --device
```

## 6. Install Claude Code and start a session that continues from here

```bash
npm install -g @anthropic-ai/claude-code
cd ~/LabTrends && claude
```

If you use the Claude desktop app's Code tab instead, open the `LabTrends` folder there.

When the session starts, paste this as your first message:

> Read CLAUDE.md, PLAN.md and docs/PHASE0.md. We're continuing Phase 0 of LabTrends on a Pixel 9a. The parser and OCR row-rebuild work. Pick up at the "Next steps" list in docs/PHASE0.md, starting with the Qwen models. Stop and ask before Phase 1.

The new session starts with no memory of this conversation. It learns the project from `CLAUDE.md`, `PLAN.md` and `docs/PHASE0.md`, which hold the rules, plan, findings and next steps.

## One thing to keep in mind

The Qwen GGUF files aren't in git. Download them from Hugging Face on the Air and push them to the phone with `adb push`. The new session can do that if you ask it.
