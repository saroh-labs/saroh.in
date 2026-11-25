"use client";

import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/** The ways on besides Publish, kept from the editor (DEC-071). */
export interface PublishMore {
    versionsHref: string;
    /** Test links: absent while they are off for the business. */
    testLinks?: { count: number; onOpen: () => void };
    /** Make a test link to share; absent without `site:update`. */
    onShareTestLink?: () => void;
    /** Go live later: from a test link, where Schedule is. */
    onSchedule?: () => void;
    /**
     * Ask a teammate to review, or withdraw the ask (P2, `fix/WXNPublish`);
     * absent for a reader. The page menu keeps it too.
     */
    review?: {
        inReview: boolean;
        asking: boolean;
        onAsk: () => void;
        onWithdraw: () => void;
    };
}

/**
 * See versions, Test links, Share a test link and Schedule (DEC-071). On a
 * phone they sit under one More with Ask a teammate to review (P2,
 * `fix/WXNPublish`), closed until pressed, so Publish keeps the foot.
 */
export function MoreRow({
    more,
    phone = false,
}: {
    more: PublishMore;
    phone?: boolean;
}) {
    const [open, setOpen] = useState(false);
    if (!phone) return <MoreLinks more={more} />;
    return (
        <div className="grid gap-1">
            <Button
                type="button"
                variant="ghost"
                aria-expanded={open}
                aria-controls="publish-more"
                className="h-11 justify-between px-2 font-semibold"
                onClick={() => setOpen((o) => !o)}
            >
                More
                <ChevronDown
                    aria-hidden
                    className={open ? "size-4 rotate-180" : "size-4"}
                />
            </Button>
            {open ? (
                <div id="publish-more" className="px-2 pb-1">
                    <MoreLinks more={more} stacked />
                </div>
            ) : null}
        </div>
    );
}

function MoreLinks({
    more,
    stacked = false,
}: {
    more: PublishMore;
    stacked?: boolean;
}) {
    const link = "h-auto p-0 font-semibold coarse:min-h-11";
    const review = stacked ? more.review : undefined;
    return (
        <div
            className={
                stacked
                    ? "grid justify-items-start gap-1 text-sm"
                    : "flex flex-wrap gap-x-4 gap-y-1 text-sm"
            }
        >
            {review ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    disabled={review.asking}
                    onClick={review.inReview ? review.onWithdraw : review.onAsk}
                >
                    {review.inReview
                        ? "Withdraw the review request"
                        : "Ask a teammate to review"}
                </Button>
            ) : null}
            <Button asChild variant="link" size="sm" className={link}>
                <IntentLink href={more.versionsHref}>See versions</IntentLink>
            </Button>
            {more.testLinks ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.testLinks.onOpen}
                >
                    Test links ({more.testLinks.count})
                </Button>
            ) : null}
            {more.onShareTestLink ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.onShareTestLink}
                >
                    Share a test link
                </Button>
            ) : null}
            {more.onSchedule ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className={link}
                    onClick={more.onSchedule}
                >
                    Schedule
                </Button>
            ) : null}
        </div>
    );
}
