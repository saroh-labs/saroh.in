"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import { ACCOUNT_TAB_HREF } from "./account/hrefs";
import type { SiteSession } from "./look-chrome";

const noSubscribe = () => () => undefined;

/** True only in the browser, after the page has loaded: never on the server. */
function useInBrowser(): boolean {
    return useSyncExternalStore(
        noSubscribe,
        () => true,
        () => false,
    );
}

/**
 * "Your account" in a look's footer (DEC-172, U5): the footer follows the
 * session. Someone signed in sees Your account and their Bookings or
 * Orders; anyone else sees Sign in. Never Sign in to someone signed in.
 *
 * DRAWN ONLY IN THE BROWSER. The page a cache keeps is shared by everyone
 * who isn't signed in, so its HTML holds no account links and no name: the
 * server draws nothing here, and the browser draws the column once the
 * page has loaded. With scripts off, the column is not there (the header's
 * Sign in still is). `session` is null while the site has no customer
 * accounts, and then nothing is offered.
 */
export function FooterSessionLinks({
    session,
    basePath = "",
    headingClassName,
    linkClassName,
}: {
    session: SiteSession | null | undefined;
    basePath?: string;
    headingClassName: string;
    linkClassName: string;
}) {
    const inBrowser = useInBrowser();
    const headingId = useId();
    if (!inBrowser || !session) return null;
    const to = (href: string) => `${basePath}${href}`;
    const links = session.signedIn
        ? [
              { label: "Your account", href: ACCOUNT_TAB_HREF.home },
              ...(session.bookings
                  ? [{ label: "Bookings", href: ACCOUNT_TAB_HREF.bookings }]
                  : []),
              ...(session.orders
                  ? [{ label: "Orders", href: ACCOUNT_TAB_HREF.orders }]
                  : []),
          ]
        : [{ label: "Sign in", href: ACCOUNT_TAB_HREF.home }];
    return (
        <nav aria-labelledby={headingId} data-site-footer-account="">
            <h2 id={headingId} className={headingClassName}>
                Your account
            </h2>
            <ul className="m-0 grid list-none gap-0 p-0">
                {links.map((link) => (
                    <li key={link.href}>
                        <Link href={to(link.href)} className={linkClassName}>
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
