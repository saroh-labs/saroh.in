"use client";

import { Button } from "@saroh/ui/button";
import { useState } from "react";

import { useChangeFeedback } from "@/lib/use-change-feedback";

import type { OfferStart } from "./offer-sheet";
import { OfferSheet } from "./offer-sheet";

/**
 * Give a custom offer… (admin plan U5, R1): the button in a business's
 * header and on its Billing tab, opening the offer sheet over the page.
 * After it went through, a past-tense toast; the page's refresh shows the
 * offer where it applies.
 */
export function GiveOffer({
    organizationId,
    businessName,
    label = "Give a custom offer…",
    variant = "default",
    start,
    onDone,
}: {
    organizationId: string;
    businessName: string;
    label?: string;
    variant?: "default" | "outline";
    start?: OfferStart;
    /** The screen's own feedback (a highlight); a toast otherwise. */
    onDone?: (message: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const feedback = useChangeFeedback();
    return (
        <>
            <Button
                type="button"
                size="sm"
                variant={variant}
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
            >
                {label}
            </Button>
            {open && (
                <OfferSheet
                    organizationId={organizationId}
                    businessName={businessName}
                    start={start}
                    onOpenChange={setOpen}
                    onDone={(message) =>
                        onDone ? onDone(message) : feedback.report({ message })
                    }
                />
            )}
        </>
    );
}
