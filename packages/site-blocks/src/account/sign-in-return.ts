"use client";

import { useEffect } from "react";

/**
 * Coming back from signing in (DEC-172, plan U12): under a look, "Sign in"
 * in the menu or the footer opens the account's sign-in page, and signing
 * in there takes the visitor back to the page they were on ("You'll come
 * back to Timetable"), as the booking's Close does (`book-return.ts`).
 *
 * The page is remembered as the link is pressed (`useSignInOpener`,
 * mounted with a look's chrome), in `sessionStorage`, holding only a path
 * and the page's own heading, and let go once used. The sign-in page
 * honours it only when it is the page the link opened: an email's link
 * straight to `/account/messages` signs in there, as before (UX-052).
 */

const KEY = "saroh.sign-in-opener";

export interface SignInBack {
    /** The page they were on: a path on this site, with its query. */
    from: string;
    /** That page's heading, for "You'll come back to …". */
    title: string;
    /** The account page the link opened. */
    to: string;
}

/** Whether an `href` opens the account on this site. */
export function opensAccount(href: string, origin: string): string | null {
    try {
        const url = new URL(href, origin);
        if (url.origin !== origin) return null;
        const path = url.pathname;
        return path === "/account" || path.startsWith("/account/")
            ? path
            : null;
    } catch {
        return null;
    }
}

/** The remembered page, if it is the one the link to `pathname` left. */
export function readSignInBack(pathname: string): SignInBack | null {
    try {
        const raw = window.sessionStorage.getItem(KEY);
        if (!raw) return null;
        const back = JSON.parse(raw) as Partial<SignInBack>;
        if (
            typeof back.from !== "string" ||
            typeof back.title !== "string" ||
            typeof back.to !== "string" ||
            !back.from.startsWith("/") ||
            back.from.startsWith("//")
        ) {
            return null;
        }
        return back.to === pathname
            ? { from: back.from, title: back.title, to: back.to }
            : null;
    } catch {
        return null;
    }
}

/** Let the remembered page go: used, or no longer wanted. */
export function forgetSignInBack(): void {
    try {
        window.sessionStorage.removeItem(KEY);
    } catch {
        // Nothing kept, nothing to let go.
    }
}

/**
 * Under a look's chrome, outside the account: remember the page a link
 * into the account was pressed on.
 */
export function useSignInOpener(): void {
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            const target = e.target as Element | null;
            const link = target?.closest("a[href]");
            const href = link?.getAttribute("href");
            if (!href) return;
            const { origin, pathname, search } = window.location;
            const to = opensAccount(href, origin);
            if (!to || opensAccount(pathname, origin)) return;
            const heading = document
                .querySelector("main h1")
                ?.textContent.replace(/\s+/g, " ")
                .trim();
            try {
                window.sessionStorage.setItem(
                    KEY,
                    JSON.stringify({
                        from: `${pathname}${search}`,
                        title: heading ?? "",
                        to,
                    } satisfies SignInBack),
                );
            } catch {
                // Signing in then stays on the account page.
            }
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, []);
}

/** `useSignInOpener` as a part to mount with the chrome. */
export function SignInOpener(): null {
    useSignInOpener();
    return null;
}
