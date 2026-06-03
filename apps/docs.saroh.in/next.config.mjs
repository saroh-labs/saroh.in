import nextra from "nextra";

// Nextra 4 (App Router). Theme + layout are configured in app/layout.jsx,
// not here — the old `theme`/`themeConfig` options are gone.
const withNextra = nextra({});

export default withNextra({
	reactStrictMode: true,
});
