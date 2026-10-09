"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Link2Off } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ViewerDate } from "@/components/shared/viewer-date";
import {
    newLinkWarning,
    UNSEEN_LINK,
    unseenLinkLine,
} from "@/lib/invoices/minted-links";

/**
 * A pay link is out that this tab can't show (UX-048): after a reload, on
 * another device, or made by sending. The API keeps only its hash (owner,
 * 8 Oct), so this says plainly why the address isn't here and that a new
 * link ends the old one — before the button is pressed. When the API says
 * when the link was made (#870), the note names the day, in the viewer's
 * zone, so the business can tell which link its customer has.
 */
export function UnseenLinkNote({
    sendable,
    madeAt,
    className,
}: {
    /** Sending the invoice from here makes a new link too. */
    sendable: boolean;
    /** When the link out was made; null or absent when not known. */
    madeAt?: string | null;
    className?: string;
}) {
    // The words come whole from `unseenLinkLine`; the date is set into
    // them as a <time>, so it reads in the viewer's zone.
    const [before, after] = madeAt
        ? unseenLinkLine({ sendable, madeOn: DATE_SLOT }).split(DATE_SLOT)
        : [unseenLinkLine({ sendable }), null];
    return (
        <p
            className={cn(
                "text-[12.5px] leading-[1.5] text-muted-foreground",
                className,
            )}
        >
            {before}
            {madeAt ? (
                <>
                    <ViewerDate iso={madeAt} />
                    {after}
                </>
            ) : null}
        </p>
    );
}

/** Where the date goes in the words, replaced by the <time>. */
const DATE_SLOT = "{date}";

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
