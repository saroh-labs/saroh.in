import nextra from "nextra";

// Nextra 4 (App Router). Theme + layout are configured in app/layout.jsx.
const withNextra = nextra({});

export default withNextra({
    // CI caps Next's build workers: os.cpus() ignores a runner's CPU limit (ci.yml).
    experimental: {
        ...(process.env.NEXT_BUILD_CPUS && {
            cpus: Number(process.env.NEXT_BUILD_CPUS),
        }),
    },
    reactStrictMode: true,
    // Consume the canonical @saroh/ui <Wordmark> as source (webpack build).
    transpilePackages: ["@saroh/ui"],
});
