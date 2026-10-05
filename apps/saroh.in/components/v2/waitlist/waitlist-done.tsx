"use client";

import { useEffect, useRef } from "react";

import type { WaitlistContent } from "@/content/waitlist";
import { openingLong } from "@/lib/waitlist";

import { ReferralLink } from "./referral-link";

export interface WaitlistJoined {
    business: string;
    email: string;
    /** A new entry's place and link; absent on a repeat (plan D-8). */
    position?: number;
    link?: { href: string; shown: string };
    /** Joined from outside India: Saroh opens there first. */
    outsideIndia?: boolean;
}

/**
 * The done state (Waitlist design): "YOU'RE IN", "‹Business› is #N on the
 * list.", when the invite comes, the referral link and "Add another
 * business". A repeat join (D-8) gets the same card without a place or a
 * link, so nobody can look up an address's place by typing it in.
 */
export function WaitlistDone({
    joined,
    content,
    onAnother,
}: {
    joined: WaitlistJoined;
    content: WaitlistContent;
    onAnother: () => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    // The form is gone: put the reader on what replaced it.
    useEffect(() => heading.current?.focus(), []);

    const when = content.openingDate
        ? `on ${openingLong(content.openingDate)} with your invite.`
        : "with your invite when we open.";
    const listed = joined.position !== undefined;

    return (
        <div className="flex flex-col gap-[18px]">
            <div className="flex items-center gap-2.5">
                <span
                    aria-hidden
                    className="size-2.5 rounded-full bg-brand-500"
                />
                <span className="font-mono text-[12px] text-brand-700">
                    YOU&apos;RE IN
                </span>
            </div>
            <h2
                ref={heading}
                tabIndex={-1}
                className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] outline-none"
            >
                {listed
                    ? `${joined.business} is #${joined.position} on the list.`
                    : `${joined.business} is on the list.`}
            </h2>
            <p className="m-0 text-[15px] leading-[1.55] text-neutral-600 [overflow-wrap:anywhere]">
                We&apos;ll email {joined.email} {when}
                {content.offer && !joined.outsideIndia
                    ? ` ${content.offer.doneLine}`
                    : null}
            </p>
            {joined.outsideIndia ? (
                <p
                    data-testid="waitlist-outside-india"
                    className="m-0 text-[15px] leading-[1.55] text-neutral-600"
                >
                    Saroh opens in India first. We&apos;ll email you when
                    it&apos;s ready where you are.
                </p>
            ) : null}
            {joined.link && (
                <ReferralLink
                    href={joined.link.href}
                    shown={joined.link.shown}
                />
            )}
            <button
                type="button"
                onClick={onAnother}
                className="cursor-pointer self-start rounded-sm text-[13px] text-neutral-600 underline underline-offset-[3px] transition-colors duration-fast ease-out hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]"
            >
                Add another business
            </button>
        </div>
    );
}
