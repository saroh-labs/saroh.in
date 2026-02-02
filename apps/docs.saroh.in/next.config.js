const withNextra = require("nextra")({
	theme: "nextra-theme-docs",
	themeConfig: "./theme.config.jsx",
});



const nextConfig = {
	reactStrictMode: true,
	transpilePackages: ["ui"],
};

module.exports = withNextra(nextConfig);
