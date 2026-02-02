export default {
    docsRepositoryBase: "https://github.com/saroh-io/saroh.io/tree/main/apps/help.saroh.in",
    logo: <span>Saroh Help</span>,
    project: {
        link: "https://dashboard.saroh.in",
    },
    footer: false,
    useNextSeoProps() {
        return {
            titleTemplate: "%s – Saroh Help",
        };
    },
};
