import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Head } from "nextra/components";
import { getPageMap } from "nextra/page-map";
import "nextra-theme-docs/style.css";

export const metadata = {
	title: {
		default: "Saroh.in Documentation",
		template: "%s – Saroh.in",
	},
};

const navbar = (
	<Navbar
		logo={<b>Saroh.in Documentation</b>}
		projectLink="https://github.com/saroh-io/saroh.io"
	/>
);

const footer = <Footer>MIT {new Date().getFullYear()} © Saroh.in</Footer>;

export default async function RootLayout({ children }) {
	return (
		<html lang="en" dir="ltr" suppressHydrationWarning>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					footer={footer}
					pageMap={await getPageMap()}
					docsRepositoryBase="https://github.com/saroh-io/saroh.io/tree/main/apps/docs.saroh.in"
				>
					{children}
				</Layout>
			</body>
		</html>
	);
}
