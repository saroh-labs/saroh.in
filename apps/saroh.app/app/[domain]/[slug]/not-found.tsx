import { headers } from "next/headers";
import Link from "next/link";

import { ctaClasses } from "@/components/sections/cta";
import { getPublicationForHost } from "@/lib/publication";

/**
 * 404 inside a tenant site.
 *
 * Reads the publication so the merchant's own site name is on the page — being
 * bounced to an unbranded error page is the moment a visitor is most likely to
 * assume the whole site is broken. Previously this called `getSiteData`, a stub
 * that always resolves null (so the name never rendered), and pulled a
 * third-party illustration from illustrations.popsy.co on every miss.
 *
 * Styled from the `--site-*` layer, never Saroh's brand tokens: this page is
 * still the merchant's website.
 */
export default async function NotFound() {
    const host = (await headers()).get("host") ?? "";
    const snapshot = await getPublicationForHost(host);

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-screen-sm flex-col items-center justify-center px-5 py-16 text-center">
            <p className="font-mono text-sm tracking-[0.2em] text-site-muted">
                404
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-site-fg sm:text-4xl">
                This page doesn&rsquo;t exist
            </h1>
            <p className="mt-3 text-base text-site-body">
                {snapshot
                    ? `The page you were looking for isn’t part of ${snapshot.site.name}.`
                    : "The page you were looking for could not be found."}
            </p>
            <Link href="/" className={`${ctaClasses("primary")} mt-8`}>
                Back to home
            </Link>
        </div>
    );
}
