"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext, useState } from "react";

/**
 * When links fetch ahead: `"intent"` (a pointer, touch or focus) or
 * `"never"`. The merchant app says never: a hovered prefetch there cost two
 * Worker requests and made the click no faster, because the click still
 * fetched the page and the section's `loading.tsx` already paints at once
 * (owner, 24 Nov 2026: only what's needed is loaded). saroh.in keeps intent.
 */
export type LinkPrefetch = "intent" | "never";
const PrefetchMode = createContext<LinkPrefetch>("intent");

export function LinkPrefetchProvider({
    mode,
    children,
}: {
    mode: LinkPrefetch;
    children: ReactNode;
}) {
    return (
        <PrefetchMode.Provider value={mode}>{children}</PrefetchMode.Provider>
    );
}

/**
 * A `<Link>` that fetches its page ahead only once someone shows they may
 * open it: a pointer over it, a touch, or keyboard focus (Next's
 * "hover-triggered prefetch"). A plain `<Link>` prefetches the moment it is
 * on screen.
 *
 * On saroh.in, links on screen as a page loads (the logo, the cookie
 * notice's Privacy, a breadcrumb) took bandwidth from the page itself on a
 * phone (Lighthouse audit, 31 Oct 2026). In the merchant app every prefetch
 * of a dynamic page is two Worker requests (the route tree, then the page
 * down to its `loading.tsx`, which runs the section's layouts and reads the
 * business): the sidebar, Home's cards, list rows and a list's tabs and
 * pages started about 35 of them on every page load (24 Nov 2026). Use it
 * for links that are many, or on every page; a plain `<Link>` for the one
 * or two a person is about to open.
 */
export function IntentLink({
    onPointerEnter,
    onTouchStart,
    onFocus,
    ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
    const [intent, setIntent] = useState(false);
    const never = useContext(PrefetchMode) === "never";
    return (
        <Link
            {...props}
            prefetch={intent && !never ? null : false}
            onPointerEnter={(e) => {
                setIntent(true);
                onPointerEnter?.(e);
            }}
            onTouchStart={(e) => {
                setIntent(true);
                onTouchStart?.(e);
            }}
            onFocus={(e) => {
                setIntent(true);
                onFocus?.(e);
            }}
        />
    );
}
