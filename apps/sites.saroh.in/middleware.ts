import { NextRequest, NextResponse } from "next/server";

export const config = {
	matcher: [
		/*
		 * Match all paths except for:
		 * 1. /api routes
		 * 2. /_next (Next.js internals)
		 * 3. /_static (inside /public)
		 * 4. all root files inside /public (e.g. /favicon.ico)
		 */
		"/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)",
	],
};

export default async function middleware(req: NextRequest) {
	const url = req.nextUrl;

	// Get hostname of request (e.g. demo.vercel.pub, demo.localhost:3000)
	const hostname = req.headers
		.get("host")!
		.replace(".localhost:3003", `.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`);

	// Get the pathname of the request (e.g. /, /about, /blog/first-post)
	const path = url.pathname;
	console.log({ url, hostname, path });

	// special case for `vercel.pub` domain
	if (hostname === "saroh.site" || hostname === "www.saroh.site") {
		return NextResponse.redirect("https://saroh.in");
	}
	if (
		hostname === "localhost:3003" ||
		hostname === process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
		hostname === "saroh.in" ||
		hostname === "www.saroh.site" ||
		hostname === "www.saroh.in"
	) {
		return NextResponse.rewrite(new URL(`/home${path}`, req.url));

		// return NextResponse.rewrite(new URL(`/home${path}`, req.url));
	}

	// rewrite everything else to `/[domain]/[path] dynamic route
	return NextResponse.rewrite(new URL(`/${hostname}${path}`, req.url));
}
