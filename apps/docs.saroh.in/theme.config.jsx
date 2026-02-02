export default {
	docsRepositoryBase: "https://github.com/saroh-io/saroh.io/tree/main/apps/docs.saroh.in",
	logo: <span>Saroh.in Documentation</span>,
	project: {
		link: "https://github.com/saroh-io/saroh.io",
	},
	footer: false,
	useNextSeoProps() {
		return {
			titleTemplate: "%s – Saroh.in",
		};
	},
	// ... other theme options
};
