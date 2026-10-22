"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useRef, useState } from "react";

import type { ConfirmResult } from "@/components/shared/confirm/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import {
    AFTER_LEAVING_URL,
    LEAVE_FAILED,
    leaveLabel,
    leaveWords,
    onlyOwnerLine,
} from "@/lib/organizations/leave-business";
import { leaveBusiness } from "@/lib/organizations/member-actions";

/**
 * "Leave {business}" (UX audit, 10 Oct 2026): the way out of a business,
 * for anyone who is in it. A Member, a Reviewer, someone on a location's
 * team and a diary person with a login had none: leaving needed the power
 * to remove people.
 *
 * It cannot be taken back (coming back needs a new invitation, and the
 * share links that went stay gone), so it is the one `ConfirmDialog`, in
 * its destructive tone, saying what is lost. The confirm waits for the
 * answer and says a refusal inside itself. Once they have left, this
 * business is no longer theirs to look at, so they go to their businesses
 * on accounts, which opens the one they have left, asks which, or starts a
 * new one.
 *
 * The only owner can't leave. They read why, and what to do first, where
 * the button would be: never a button that is refused.
 */
export function LeaveBusiness({
    business,
    onlyOwner,
    locations = [],
    size = "default",
    className,
    onLeft = goToBusinesses,
}: {
    business: string;
    /** The business's only owner (the API refuses them). */
    onlyOwner: boolean;
    /** Locations of this business they work at, which they come off too. */
    locations?: readonly string[];
    /** `sm` for a row. */
    size?: "default" | "sm";
    className?: string;
    /** Left out, the browser goes to their businesses on accounts. */
    onLeft?: () => void;
}) {
    const [asking, setAsking] = useState(false);
    const opener = useRef<HTMLButtonElement>(null);
    const words = leaveWords(business, locations);

    if (onlyOwner) {
        return (
            <p
                data-leave="only-owner"
                className={cn(
                    "text-pretty text-[12.5px] leading-normal text-muted-foreground",
                    className,
                )}
            >
                {onlyOwnerLine(business)}
            </p>
        );
    }

    async function leave(): Promise<ConfirmResult> {
        const res = await leaveBusiness();
        if (!res.ok) return { ok: false, error: res.error || LEAVE_FAILED };
        onLeft();
    }

    return (
        <>
            <Button
                ref={opener}
                type="button"
                variant="outline"
                size={size}
                className={cn(
                    "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                    className,
                )}
                onClick={() => setAsking(true)}
            >
                {leaveLabel(business)}
            </Button>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                returnFocusTo={opener}
                title={words.title}
                description={words.description}
                confirmLabel={words.confirmLabel}
                keepLabel={words.keepLabel}
                onConfirm={leave}
            />
        </>
    );
}

function goToBusinesses() {
    window.location.assign(AFTER_LEAVING_URL);
}
