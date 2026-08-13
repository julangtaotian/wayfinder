# Bundled Playwright Runtime

This release asset pins Playwright 1.62.1, PNGJS 7.0.0, and pixelmatch 7.1.0 once in the shared `node_modules` tree. Browser assets are isolated under `platform-assets/<platform-arch>` and selected through matching metadata in `platforms/`.

The supported packs are `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`, and `win32-x64`. Each pack contains its own Chromium headless shell, FFmpeg, licenses, and integrity manifest; the shared JavaScript runtime has a separate manifest. The repository keeps all five canonical packs, while an installable platform distribution contains exactly one matching pack plus the complete shared runtime. Target frontend repositories do not install or resolve these packages.

Downloads are allowed only through the preview-first `build-playwright-platform.mjs` maintenance command while building or updating the plugin. Runtime inspection, smoke tests, adapters, and unified UI review must never download browsers or fall back to an end-user cache.

Use the preview-first `package-plugin-platform.mjs` command to stage an installable platform marketplace. It writes only with explicit `--write`, rejects existing or unsafe output paths, rebuilds integrity after pruning, and enforces platform budgets with headroom. Chromium, FFmpeg, licenses, the shared runtime, and integrity manifests are mandatory. Linux ARM64 debug symbols are removed only from the native staged copy and the packaged browser must still pass a real smoke test.
