"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { closeHref } from "./step-url";

/**
 * Leaving the booking and coming back to where it was opened (DEC-172,
 * plan U10): Escape or Close on a look's frame goes back to the page the
 * visitor came from on this site (else home) with `router.replace`, so
 * Back doesn't open the booking again; their choices stay kept for the
 * visit (`booking-draft.ts`), and focus goes back to the link that opened
 * it.
 *
 * The link is remembered as it is pressed (`useBookOpener`, mounted with
 * the look's chrome), and found again on the page closing lands on
 * (`useBookReturnFocus`). Both live in `sessionStorage`, hold only a path
 * and an `href`, and are let go once used.
 */

const OPENER = "saroh.book-opener";
const RETURN = "saroh.book-return";

interface Opener {
    from: string;
    href: string;
}

function read<T>(key: string): T | null {
    try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function write(key: string, value: unknown): void {
    try {
        if (value === null) window.sessionStorage.removeItem(key);
        else window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Focus then starts at the page's top, as on any arrival.
    }
}

/** Whether an `href` opens the booking route on this site. */
export function opensBooking(href: string, origin: string): boolean {
    try {
        const url = new URL(href, origin);
        return url.origin === origin && url.pathname === "/book";
    } catch {
        return false;
    }
}

/** Close the booking: back where it came from, the choices kept. */
export function useCloseBooking(): () => void {
    const router = useRouter();
    return useCallback(() => {
        const { origin } = window.location;
        const opener = read<Opener>(OPENER);
        // A link on this site opened it: back to that page. A client-side
        // move leaves `document.referrer` as it was when the site loaded,
        // so the remembered page comes first, then the referrer, then home.
        const to = opener
            ? closeHref(new URL(opener.from, origin).href, origin)
            : closeHref(document.referrer, origin);
        write(RETURN, opener ? { to, href: opener.href } : null);
        router.replace(to);
    }, [router]);
}

/**
 * Under a look's chrome: remember the link that opened the booking, and,
 * arriving back from closing it, put focus on that link again.
 */
export function useBookReturnFocus(path: string | null): void {
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as Element | null;
            const link = target?.closest("a[href]");
            const href = link?.getAttribute("href");
            if (!href || !opensBooking(href, window.location.origin)) return;
            // Within the booking itself, nothing new opened it.
            if (window.location.pathname === "/book") return;
            write(OPENER, {
                from: `${window.location.pathname}${window.location.search}`,
                href,
            } satisfies Opener);
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, []);

    useEffect(() => {
        const back = read<{ to: string; href: string }>(RETURN);
        if (!back) return;
        const to = new URL(back.to, window.location.origin).pathname;
        if (to !== window.location.pathname) return;
        write(RETURN, null);
        const links = Array.from(
            document.querySelectorAll<HTMLAnchorElement>("a[href]"),
        ).filter(
            (a) =>
                a.getAttribute("href") === back.href &&
                a.closest('[role="dialog"]') === null,
        );
        // The one on the page itself before the chrome's copy of it.
        const link =
            links.find((a) => a.closest("[data-site-header]") === null) ??
            links.at(0);
        link?.focus();
    }, [path]);
}
