"use client";

import type { DemoTrade } from "@/content/demos";
import { DEMO_LABEL } from "@/content/demos";
import { track } from "@/lib/analytics";

import { ButtonLink } from "./button";

/**
 * "See a live demo" (#1191): the secondary button beside a hero's start
 * button. It opens a demo business's booking page in a new tab and sends
 * `demo_open { page, trade }`.
 */
export function DemoLink({
    href,
    page,
    trade,
}: {
    /** From `demoHref` (`lib/demos.ts`); null renders nothing. */
    href: string | null;
    /** Where the button is: `home`, `pricing` or `solutions-<slug>`. */
    page: string;
    trade: DemoTrade;
}) {
    if (!href) return null;
    return (
        <ButtonLink
            href={href}
            variant="secondary"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("demo_open", { page, trade })}
        >
            {DEMO_LABEL}
        </ButtonLink>
    );
}
