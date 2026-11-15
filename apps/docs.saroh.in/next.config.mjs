import nextra from "nextra";

// Nextra 4 (App Router). Theme + layout are configured in app/layout.jsx,
// not here — the old `theme`/`themeConfig` options are gone.
const withNextra = nextra({});

// A static export (out/), served as Workers static assets behind
// worker/index.js: no Next server, so no redirects or headers here.
export default withNextra({
    output: "export",
    images: { unoptimized: true },
    poweredByHeader: false,
    reactStrictMode: true,
    // Consume the canonical @saroh/ui <Wordmark> as source (webpack build).
    transpilePackages: ["@saroh/ui"],
});
