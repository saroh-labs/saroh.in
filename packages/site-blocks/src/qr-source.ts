"use client";

import { useSyncExternalStore } from "react";

/**
 * Which QR code brought a visitor to this page, for the business's count of
 * the bookings and orders each code brings in.
 *
 * THE RULE: attribution rides the address, and nothing else. A scan of a
 * code opens its page with `?src=qr-<code>` on the address
 * (`apps/saroh.app/lib/qr-resolve.ts`). The tag is read from that address
 * here, in the browser, and sent with the booking or the order started
 * from that page load. It is never written to a cookie, `localStorage`,
 * `sessionStorage` or any other store, and it names a printed code, not a
 * person (DEC-108). So:
 *
 * - a booking made on the page the scan opened is counted, and so is one
 *   reached through a link on that page that carries the tag on
 *   ({@link withQrSource}: a service in a services list, the booking block,
 *   a time under "On today");
 * - an order placed in the same page load is counted: the bag's sheet has no
 *   address of its own, so the bag holds the tag in memory while the page
 *   stays loaded (`shop/bag.tsx`), and never in the stored bag;
 * - reloading without the tag, opening the site again later, another tab,
 *   or reaching the booking page by a link that doesn't carry it: not
 *   counted. Nothing remembers the scan.
 *
 * Read in the browser only, never while the server draws the page, so a
 * page drawn for `?src=qr-abc` is the same page as one drawn without it and
 * the page cache keeps nothing about a scan.
 *
 * The server decides what a tag is worth: it looks the code up on the site
 * the customer is signed in to and ignores anything else.
 */

/** The tag's query parameter and prefix: `?src=qr-<code>`. */
export const QR_SOURCE_PARAM = "src";
export const QR_SOURCE_PREFIX = "qr-";

/** A tag as a link may carry it: the prefix and a short lower-case code. */
const QR_SOURCE_SHAPE = /^qr-[0-9a-z]{3,6}$/;

/** The tag a query string carries, or null when it carries none. */
export function qrSourceOf(search: string): string | null {
    let value: string | null;
    try {
        value = new URLSearchParams(search).get(QR_SOURCE_PARAM);
    } catch {
        return null;
    }
    const tag = value?.trim().toLowerCase() ?? "";
    return QR_SOURCE_SHAPE.test(tag) ? tag : null;
}

/**
 * The tag on this page's address now. Null on the server, and wherever the
 * address can't be read.
 *
 * `useState(readQrSource)` keeps it for a component's life, which is right
 * only for something that starts with the page load (the bag in the site's
 * header). A component a link inside the site opens is first drawn before
 * the address changes, so it reads with {@link useQrSource} instead.
 */
export function readQrSource(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return qrSourceOf(window.location.search);
    } catch {
        return null;
    }
}

/** The address changes only by navigation, which draws the page again. */
const never = () => () => undefined;
const onServer = () => null;

/**
 * The tag on the address of the page this component is on: null while the
 * server's page is taken over, then the tag, so what the server drew and
 * what the browser first draws agree (a link's `href`). React reads it
 * again once the page is on screen, so a component opened by a link inside
 * the site ends with its own address's tag, not the page's before it.
 */
export function useQrSource(): string | null {
    return useSyncExternalStore(never, readQrSource, onServer);
}

/**
 * `href` with the tag carried on, for a link into the booking page from the
 * page a scan opened. Unchanged without a tag, and for anything that isn't
 * a path on this site.
 */
export function withQrSource(href: string, source: string | null): string {
    if (!source || !href.startsWith("/") || href.startsWith("//")) return href;
    const hashAt = href.indexOf("#");
    const hash = hashAt < 0 ? "" : href.slice(hashAt);
    const beforeHash = hashAt < 0 ? href : href.slice(0, hashAt);
    const queryAt = beforeHash.indexOf("?");
    const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt);
    const params = new URLSearchParams(
        queryAt < 0 ? "" : beforeHash.slice(queryAt + 1),
    );
    params.set(QR_SOURCE_PARAM, source);
    return `${path}?${params.toString()}${hash}`;
}
