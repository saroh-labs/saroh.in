"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Link2Off } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
    newLinkWarning,
    UNSEEN_LINK,
    unseenLinkLine,
} from "@/lib/invoices/minted-links";

/**
 * A pay link is out that this tab can't show (UX-048): after a reload, on
 * another device, or made by sending. The API keeps only its hash (owner,
 * 8 Oct), so this says plainly why the address isn't here and that a new
 * link ends the old one — before the button is pressed.
 */
export function UnseenLinkNote({
    sendable,
    className,
}: {
    /** Sending the invoice from here makes a new link too. */
    sendable: boolean;
    className?: string;
}) {
    return (
        <p
            className={cn(
                "text-[12.5px] leading-[1.5] text-muted-foreground",
                className,
            )}
        >
            {unseenLinkLine({ sendable })}
        </p>
    );
}

/** Asked before a new pay link replaces the one out (UX-048). */
export function NewLinkConfirm({
    open,
    onOpenChange,
    who,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Who the invoice is billed to: the one to send the new link. */
    who: string;
    onConfirm: () => void;
}) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={UNSEEN_LINK.confirmTitle}
            description={newLinkWarning(who)}
            confirmLabel={UNSEEN_LINK.confirmLabel}
            cancelLabel={UNSEEN_LINK.cancelLabel}
            onConfirm={onConfirm}
            icon={Link2Off}
        />
    );
}
