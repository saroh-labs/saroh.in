"use client";

import { track } from "@/lib/analytics";
import type { LaunchMode } from "@/lib/links";
import { cta } from "@/lib/links";

import type { ButtonSize, ButtonVariant } from "./button";
import { ButtonLink } from "./button";

/**
 * A "start" button: its label and address come from the one CTA builder
 * (`lib/links.ts`, KTD-16), so waitlist and open mode never disagree, and a
 * click sends `cta_click { plan, page, mode }` — no personal data.
 */
export function CtaLink({
    src,
    plan,
    planName,
    paid,
    trialDays,
    cycle,
    mode,
    variant = "primary",
    size = "lg",
    className,
    short = false,
    onNavigate,
}: {
    /** Where on the site this button is, e.g. `nav`, `home-hero`. */
    src: string;
    plan?: string;
    /** The plan's name and whether it costs anything, from the catalogue. */
    planName?: string;
    paid?: boolean;
    trialDays?: number;
    /** The cycle a paid plan's card shows; open mode carries it to sign-up. */
    cycle?: "month" | "year";
    mode?: LaunchMode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
    /** The builder's short label, where space is tight (the phone nav). */
    short?: boolean;
    onNavigate?: () => void;
}) {
    const action = cta({
        src,
        plan,
        planName,
        paid,
        trialDays,
        cycle,
        mode,
    });
    return (
        <ButtonLink
            href={action.href}
            variant={variant}
            size={size}
            className={className}
            onClick={() => {
                track("cta_click", { plan, page: src, mode: action.mode });
                onNavigate?.();
            }}
        >
            {short ? action.shortLabel : action.label}
        </ButtonLink>
    );
}
