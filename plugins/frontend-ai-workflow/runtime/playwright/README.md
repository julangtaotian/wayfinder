# Bundled Playwright Runtime

This directory is a release asset of `frontend-ai-workflow`. It pins Playwright and a platform-specific Chromium headless shell so target frontend repositories do not install Playwright themselves.

Runtime installation is allowed only while building or updating the plugin. Plugin commands must use the bundled package and must not download browsers on an end-user machine.
