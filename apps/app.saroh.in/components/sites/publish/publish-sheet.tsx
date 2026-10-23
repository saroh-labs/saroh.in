"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@saroh/ui/sheet";
import { X } from "lucide-react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { pendingChangeCount } from "@/lib/sites/pending";
import type {
    Flag,
    FlagType,
    ReviewState,
    SitePage,
} from "@/lib/sites/service";
import { OVERRIDE_RECORD } from "@/lib/sites/test-releases";
import type { WebAddressFix } from "./address-fix";
import { APPROVAL_LINE, publishWaitsFor } from "./pre-publish-words";
import { GoingLive, PublishFlags } from "./publish-list";
import { PublishLiveBody, PublishLiveFoot } from "./publish-live";
import type { WentLive } from "./use-publish";

/**
 * Publish (DEC-185): one sheet over the editor — from the right on a desk,
 * from the foot on a phone — never a screen of its own. It says what goes
 * live, puts what blocks publishing first in red with its fix (Publish
 * greyed out, the foot saying why), lists the advice as not stopping you,
 * fixes the web address in place, shows Publishing… and then turns into
 * the result. The same surface whatever the list's length: the same button
 * always opens the same place.
 *
 * The approval rules stay as they were (DEC-071, #278): with "Publishing
 * needs approval" only an owner's Publish goes through, as the recorded
 * override; an open request for changes is published past and recorded.
 */
export function PublishSheet({
    open,
    phone,
    pages,
    flags,
    awaitingNavigation,
    publishing,
    unsaved,
    neverPublished,
    pendingSummary,
    pendingKnown,
    pendingChanges,
    pendingSiteChanges,
    review,
    needsApproval = false,
    canOverride = false,
    scheduledWarning = null,
    wentLive = null,
    error = null,
    addressFix = null,
    onAddressSaved,
    onPublish,
    onClose,
    onJump,
}: {
    open: boolean;
    /** From the foot, in thumb's reach; from the right on a desk. */
    phone: boolean;
    pages: SitePage[];
    flags: Flag[];
    awaitingNavigation: FlagType[];
    publishing: boolean;
    /**
     * Work not saved yet — the page, the look, the name or the footer.
     * Publishing now would put live what was saved before it (review G-1).
     */
    unsaved: boolean;
    /** Never-published sites say "Publish site", not "Publish changes". */
    neverPublished: boolean;
    pendingSummary: string | null;
    pendingKnown: boolean;
    pendingChanges: number | null;
    pendingSiteChanges: readonly string[] | null;
    /** "Approval also shows as a line in the pre-publish check" (spec §2). */
    review: ReviewState;
    needsApproval?: boolean;
    canOverride?: boolean;
    /** A scheduled go-live won't run over this publish (KTD-14). */
    scheduledWarning?: string | null;
    /** The publish went through: the sheet is its result. */
    wentLive?: WentLive | null;
    /** Why the last publish didn't go, in the foot. */
    error?: { message: string; detail?: string } | null;
    /** The web address, offered in place; null when it can't be read. */
    addressFix?: WebAddressFix | null;
    /** An address was chosen here: the flags are read again. */
    onAddressSaved: (host: string) => void;
    onPublish: () => void;
    onClose: () => void;
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
    const zone = useBusinessZone();
    // The address chosen in this sheet, said as "Fixed" until it closes.
    const [fixedHost, setFixedHost] = useState<string | null>(null);
    const shown = flags.filter(
        (f) => !(fixedHost && f.type === "addressMissing"),
    );
    const blockers = shown.filter((f) => f.blocking);
    const waitsFor = publishWaitsFor({ blockers, unsaved });
    const label =
        needsApproval || review.outstanding
            ? "Publish without approval"
            : neverPublished
              ? "Publish site"
              : "Publish changes";
    const changes = pendingChangeCount(pendingChanges, pendingSiteChanges);
    const footLine = publishing
        ? neverPublished || changes === 0
            ? "Putting the site live…"
            : `Putting ${count(changes, "change")} live…`
        : waitsFor;

    const close = () => {
        setFixedHost(null);
        onClose();
    };

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) close();
            }}
        >
            <SheetContent
                side={phone ? "bottom" : "right"}
                closeButton={false}
                aria-describedby={undefined}
                data-publish-sheet=""
                className={cn(
                    "flex flex-col gap-0 bg-background p-0",
                    phone
                        ? "max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
                        : "w-[440px] max-w-[92vw] sm:max-w-[440px]",
                )}
            >
                {phone ? (
                    <span
                        aria-hidden
                        className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border"
                    />
                ) : null}
                <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                    <SheetTitle className="flex-1 font-sans text-base">
                        {wentLive ? "Published" : label}
                    </SheetTitle>
                    <SheetClose asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Close"
                            className="coarse:size-11"
                        >
                            <X aria-hidden />
                        </Button>
                    </SheetClose>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {wentLive ? (
                        <PublishLiveBody live={wentLive} />
                    ) : (
                        <>
                            <GoingLive
                                {...{
                                    neverPublished,
                                    pendingKnown,
                                    pendingSummary,
                                    pendingChanges,
                                    pendingSiteChanges,
                                }}
                            />
                            {needsApproval ? (
                                <Notice tone="error" role="note">
                                    {canOverride
                                        ? `This site goes live only from an approved test release. As an owner you can publish without approval. ${OVERRIDE_RECORD}`
                                        : "This site goes live only from an approved test release. Make a test release and ask for a review."}
                                </Notice>
                            ) : null}
                            {scheduledWarning ? (
                                <Notice>{scheduledWarning}</Notice>
                            ) : null}
                            {review.latestApproval === null ? null : (
                                <p
                                    className={
                                        APPROVAL_LINE[
                                            review.latestApproval.outcome
                                        ].approved
                                            ? "rounded-md bg-muted px-3 py-2 text-sm text-foreground"
                                            : "rounded-md border px-3 py-2 text-sm text-muted-foreground"
                                    }
                                >
                                    {APPROVAL_LINE[
                                        review.latestApproval.outcome
                                    ].text(review.latestApproval, zone)}
                                    {review.openNotes > 0
                                        ? `, with ${count(review.openNotes, "note")} still open.`
                                        : "."}
                                    {review.outstanding ? (
                                        <span className="mt-1 block">
                                            A reviewer&apos;s request for
                                            changes is still open. Publishing
                                            now goes ahead without approval, and
                                            records that it did, here and in
                                            version history.
                                        </span>
                                    ) : null}
                                </p>
                            )}
                            <PublishFlags
                                flags={flags}
                                pages={pages}
                                addressFix={addressFix}
                                fixedHost={fixedHost}
                                onAddressSaved={(host) => {
                                    setFixedHost(host);
                                    onAddressSaved(host);
                                }}
                                onJump={onJump}
                            />
                            {/*
                             * Said plainly: a check that silently skips two
                             * of its tests would let "nothing outstanding"
                             * read as more than it is.
                             */}
                            {awaitingNavigation.length > 0 ? (
                                <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                                    Two checks are not running yet: whether a
                                    hidden section is still linked from your
                                    navigation, and whether a page is missing
                                    from it. Saroh does not manage your
                                    navigation yet.
                                </p>
                            ) : null}
                        </>
                    )}
                </div>

                <div className="shrink-0 border-t px-4 py-3">
                    {wentLive ? (
                        <PublishLiveFoot
                            live={wentLive}
                            phone={phone}
                            onDone={close}
                        />
                    ) : (
                        <div
                            className={cn(
                                "flex gap-2",
                                phone
                                    ? "flex-col"
                                    : "flex-wrap items-center justify-end",
                            )}
                        >
                            {error ? (
                                <p
                                    role="alert"
                                    className="mr-auto text-sm text-destructive-subtle-foreground"
                                >
                                    {error.message}
                                    {error.detail ? (
                                        <span className="block text-xs text-muted-foreground">
                                            {error.detail}
                                        </span>
                                    ) : null}
                                </p>
                            ) : footLine ? (
                                <p
                                    data-publish-waits=""
                                    className="mr-auto text-xs text-muted-foreground"
                                >
                                    {footLine}
                                </p>
                            ) : null}
                            <Button
                                type="button"
                                variant={phone ? "ghost" : "outline"}
                                disabled={publishing}
                                onClick={close}
                                className={cn(phone && "order-last")}
                            >
                                Not now
                            </Button>
                            <Button
                                type="button"
                                // An owner's override is the destructive kind
                                // of publish: it goes past a rule the
                                // business set.
                                variant={
                                    needsApproval ? "destructive" : "default"
                                }
                                disabled={
                                    unsaved ||
                                    blockers.length > 0 ||
                                    (needsApproval && !canOverride)
                                }
                                onClick={onPublish}
                                busy={publishing}
                                busyLabel="Publishing…"
                            >
                                {label}
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
