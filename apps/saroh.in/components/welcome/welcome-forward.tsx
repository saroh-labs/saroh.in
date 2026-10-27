"use client";

import { useEffect, useRef } from "react";

import type { TagConfig } from "@/lib/ga";
import { readWelcome } from "@/lib/welcome";
import { forwardWelcome } from "@/lib/welcome-forward";

/**
 * `/welcome`'s one job, done as the page opens (`lib/welcome-forward.ts`):
 * count the sign-up if this visitor accepted advertising cookies, then go
 * on to where accounts was sending them. The link is for the moment it
 * takes, and for a browser that won't be moved: it points at the app
 * launcher as served, and at the visitor's own destination once read.
 */
export function WelcomeForward({
    config,
    accountsUrl,
}: {
    config: TagConfig;
    accountsUrl: string;
}) {
    const link = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        // Read before `forwardWelcome` cuts the address back.
        const { next } = readWelcome(window.location.search, accountsUrl, 0);
        if (link.current) link.current.href = next;
        return forwardWelcome({
            config,
            accountsUrl,
            go: (url) => window.location.replace(url),
        });
    }, [config, accountsUrl]);
    return (
        <a
            ref={link}
            href={`${accountsUrl}/apps`}
            className="cursor-pointer rounded-sm text-foreground underline underline-offset-[3px] hover:text-mk-copy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:text-muted-foreground"
        >
            Continue
        </a>
    );
}
