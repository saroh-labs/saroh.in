"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { ShareLink } from "@saroh/ui/copy-button";
import { StepCard } from "./parts";

/**
 * "Send a payment link" done (B13): the order is made and waits unpaid,
 * and its payment link (B11) is shown this once — only its hash is kept. Saroh
 * doesn't send it; it is copied and sent to them by hand.
 */
export function LinkMade({
    url,
    reach,
    orderHref,
    onDone,
}: {
    url: string;
    /** Their phone or email, to say where it goes. */
    reach: string | null;
    orderHref: string;
    onDone: () => void;
}) {
    return (
        <StepCard title="Payment link">
            <p className="text-pretty text-[13px] leading-[1.5]">
                Order made. It waits unpaid until they pay. Send them this link
                {reach ? ` at ${reach}` : ""}.
            </p>
            <div className="mt-2.5 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                    {url}
                </code>
                <ShareLink
                    value={url}
                    label="Copy payment link"
                    text="Your link to pay for the order"
                    className="shrink-0"
                />
            </div>
            <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                Shown this once, so copy it now. Saroh doesn&apos;t send it. The
                order shows paid once they pay.
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button asChild variant="outline" size="sm">
                    <Link href={orderHref}>Open the order</Link>
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={onDone}
                    className="cursor-pointer"
                >
                    Done
                </Button>
            </div>
        </StepCard>
    );
}
