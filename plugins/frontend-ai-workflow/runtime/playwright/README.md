# Bundled Playwright Runtime

This release asset pins Playwright 1.62.1, PNGJS 7.0.0, and pixelmatch 7.1.0 once in the shared `node_modules` tree. Browser assets are isolated under `platform-assets/<platform-arch>` and selected through matching metadata in `platforms/`.

The first supported packs are `darwin-arm64` and `linux-x64`. Each pack contains its own Chromium headless shell, FFmpeg, licenses, and integrity manifest; the shared JavaScript runtime has a separate manifest. Target frontend repositories do not install or resolve these packages.

Downloads are allowed only through the preview-first `build-playwright-platform.mjs` maintenance command while building or updating the plugin. Runtime inspection, smoke tests, adapters, and unified UI review must never download browsers or fall back to an end-user cache.
