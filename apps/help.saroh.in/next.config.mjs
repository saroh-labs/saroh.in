import nextra from "nextra";

// Nextra 4 (App Router). Theme + layout are configured in app/layout.jsx.
const withNextra = nextra({});

export default withNextra({
	reactStrictMode: true,
	// Consume the canonical @saroh/ui <Wordmark> as source (webpack build).
	transpilePackages: ["@saroh/ui"],
});
