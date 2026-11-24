"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";

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
    return (
        <Link
            {...props}
            prefetch={intent ? null : false}
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
