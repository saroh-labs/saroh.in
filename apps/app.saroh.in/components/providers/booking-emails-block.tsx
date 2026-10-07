import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId } from "react";

import type { BookingEmails } from "@/lib/providers/booking-emails";
import {
    CONTACT_EMAIL_HREF,
    SEE_PLANS_HREF,
} from "@/lib/providers/booking-emails";

/**
 * Settings → Providers' "Booking emails" block (DEC-086): Saroh sending the
 * business's booking emails while it has no email of its own, how much of
 * the month's allowance is used, who the customer sees it from and where
 * replies go. Above the Available group, never in Connected — Saroh is not
 * a provider the business connected. Its one action jumps to the first
 * email provider to connect, or, on a plan with no room to connect one
 * (DEC-086), to the plans.
 */

const PILL = {
    // Not green: green is for what the business connected itself.
    sending: "bg-muted text-foreground/80",
    near: "bg-highlight-subtle text-highlight-subtle-foreground",
    paused: "bg-highlight-subtle text-highlight-subtle-foreground",
} as const;

export function BookingEmailsBlock({
    emails,
    connectHref,
}: {
    emails: BookingEmails;
    /** The first email provider's row on this page; null when none is offered. */
    connectHref: string | null;
}) {
    const id = useId();
    if (emails.kind === "unread") {
        return <PartialNotice>{emails.text}</PartialNotice>;
    }
    const b = emails.block;
    // Near or at the cap, the way out is what the block asks for.
    const urgent = b.tone !== "sending";
    const variant = urgent ? "default" : "outline";
    return (
        <section aria-labelledby={id}>
            <h3
                id={id}
                className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                Booking emails
            </h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card px-4 py-[13px] min-[760px]:px-[18px]">
                <div className="flex flex-col gap-2.5 min-[760px]:flex-row min-[760px]:items-start min-[760px]:gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13.5px] font-semibold">
                                {b.status}
                            </span>
                            <span
                                className={cn(
                                    "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                                    PILL[b.tone],
                                )}
                            >
                                {b.pill}
                            </span>
                        </div>
                        <p className="text-[12.5px] tabular-nums text-foreground/80">
                            {b.usage}
                        </p>
                        <p className="mt-1 text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                            {b.body}
                        </p>
                    </div>
                    {b.own === "connect" && connectHref ? (
                        <div className="shrink-0">
                            <Button asChild size="sm" variant={variant}>
                                <a href={connectHref}>Connect your email</a>
                            </Button>
                        </div>
                    ) : b.own === "upgrade" ? (
                        <div className="shrink-0">
                            <Button asChild size="sm" variant={variant}>
                                <Link href={SEE_PLANS_HREF}>See plans</Link>
                            </Button>
                        </div>
                    ) : null}
                </div>

                <dl className="mt-2.5 space-y-1.5 border-t border-dashed border-border pt-2.5 text-[12px] leading-[1.45]">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <dt className="text-muted-foreground">
                            Customers see it from
                        </dt>
                        <dd className="min-w-0 break-all font-mono text-foreground">
                            {b.sender}
                        </dd>
                    </div>
                    {b.replyTo ? (
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <dt className="text-muted-foreground">
                                Replies go to
                            </dt>
                            <dd className="min-w-0 break-all font-mono text-foreground">
                                {b.replyTo}
                            </dd>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                            <dt className="sr-only">Replies</dt>
                            <dd className="text-pretty text-muted-foreground">
                                {b.noReply}
                            </dd>
                            <dd className="shrink-0">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={CONTACT_EMAIL_HREF}>
                                        Add a contact email
                                    </Link>
                                </Button>
                            </dd>
                        </div>
                    )}
                </dl>
            </div>
        </section>
    );
}
