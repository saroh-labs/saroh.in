"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";

/**
 * A `<Link>` that fetches its page ahead only once someone shows they may
 * open it: a pointer over it, a touch, or keyboard focus (Next's
 * "hover-triggered prefetch"). For links on screen as a page loads, such as
 * the logo, the cookie notice's Privacy and a breadcrumb: prefetched as soon
 * as they were seen, they took bandwidth from the page itself on a phone
 * (Lighthouse audit, 31 Oct 2026).
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
