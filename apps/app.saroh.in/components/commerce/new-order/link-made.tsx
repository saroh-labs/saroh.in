"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy } from "lucide-react";
import Link from "next/link";

import { StepCard } from "./parts";

/**
 * "Send a payment link" done (B13): the order is made and waits unpaid,
 * and its pay link (B11) is shown this once — only its hash is kept. Saroh
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
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            showSuccess("Pay link copied");
        } catch {
            showError("Couldn't copy it. Select the link and copy it.");
        }
    }
    return (
        <StepCard title="Payment link">
            <p className="text-pretty text-[13px] leading-[1.5]">
                Order made. It waits unpaid until they pay — send them this link
                {reach ? ` at ${reach}` : ""}.
            </p>
            <div className="mt-2.5 flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                    {url}
                </code>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy()}
                    aria-label="Copy the pay link"
                    className="cursor-pointer"
                >
                    <Copy aria-hidden className="size-4" />
                </Button>
            </div>
            <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                Shown this once — copy it now. Saroh doesn&apos;t send it; the
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
