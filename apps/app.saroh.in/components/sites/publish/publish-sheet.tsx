"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@saroh/ui/sheet";
import { X } from "lucide-react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { SharePage } from "@/components/sites/share/share-page-sheet";
import { SharePageSheet } from "@/components/sites/share/share-page-sheet";
import { formatDate } from "@/lib/format/datetime";
import { publishLabel } from "@/lib/sites/leave-out";
import { pendingChangeCount } from "@/lib/sites/pending";
import type {
    Flag,
    FlagType,
    ReviewState,
    SitePage,
} from "@/lib/sites/service";
import { OVERRIDE_RECORD } from "@/lib/sites/test-releases";
import type { WebAddressFix } from "./address-fix";
import { PrePublishChecks } from "./pre-publish-checks";
import { CHECK_TYPES, publishWaitsFor } from "./pre-publish-words";
import { PublishChanges } from "./publish-changes";
import { ApprovalLine, GoingLive, PublishFlags } from "./publish-list";
import { LeftOutLine, PublishLiveBody, PublishLiveFoot } from "./publish-live";
import type { PublishMore } from "./publish-more";
import { MoreRow } from "./publish-more";
import type { WentLive } from "./use-publish";
import type { PublishChanges as Changes } from "./use-publish-changes";

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
 *
 * U11 (WXMPublish): "N changes waiting" by who made them, each with Leave
 * out; the checks on top; posts said apart; "Publish 4 of 5 changes now";
 * afterwards Tell people. With per-change approval (DEC-226) a teammate's
 * waiting change is left out by default and only an owner puts it in, as
 * the recorded override. The same sheet from the site header's status
 * chip and the editor's Publish; a phone's is the whole screen.
 */
export function PublishSheet({
    open,
    siteId,
    changes = null,
    more,
    share = null,
    onAsk,
    onFlagsChanged,
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
    siteId: string;
    /** The changes by person (U7); null: today's one-line summary. */
    changes?: Changes | null;
    more?: PublishMore;
    /** The page Tell people opens on, once published (U12). */
    share?: { page: SharePage; business: string; host: string } | null;
    onAsk?: (name: string) => void;
    /** A photo was described in the checks: read the flags again. */
    onFlagsChanged: () => void;
    /** The whole screen on a phone, Publish pinned; from the right on a desk. */
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
    review: ReviewState | null;
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
    onPublish: (choice: { leaveOut: string[]; overriding: boolean }) => void;
    onClose: () => void;
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
    const zone = useBusinessZone();
    // The address chosen in this sheet, said as "Fixed" until it closes.
    const [fixedHost, setFixedHost] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);
    const shown = flags.filter(
        (f) => !(fixedHost && f.type === "addressMissing"),
    );
    const blockers = shown.filter((f) => f.blocking);
    // The checks have their own box on top (U10); the rest stay listed,
    // but never "Changes visitors cannot see yet": that is this sheet's
    // own subject.
    const listed = flags.filter(
        (f) =>
            f.type !== "unpublishedChanges" &&
            (f.blocking === true || !CHECK_TYPES.has(f.type)),
    );
    const list = changes?.read === "ready" ? changes.changes : null;
    // Per-change approval (U9) replaces the whole-site refusal when sent.
    const perChange = list?.approvalRequired !== undefined;
    const siteWide = needsApproval && !perChange;
    const total = list?.count ?? 0;
    const included = list
        ? list.units.filter((u) => !changes?.leftOut.has(u.key)).length
        : 0;
    const overriding = changes?.overriding === true;
    const nothingIn = total > 0 && included === 0;
    const waitsFor =
        publishWaitsFor({ blockers, unsaved }) ??
        (nothingIn
            ? "Everything is left out. Include a change to publish"
            : null);
    const label = error
        ? "Try again"
        : siteWide || review?.outstanding
          ? "Publish without approval"
          : neverPublished
            ? "Publish site"
            : total > 0
              ? publishLabel(total, included)
              : "Publish changes";
    const changesCount = pendingChangeCount(pendingChanges, pendingSiteChanges);
    const footLine = publishing
        ? neverPublished || changesCount === 0
            ? "Putting the site live…"
            : `Putting ${count(included || changesCount, "change")} live…`
        : waitsFor;
    const title = wentLive
        ? "Published"
        : total > 0
          ? `${count(total, "change")} waiting`
          : neverPublished
            ? "Publish site"
            : "Publish changes";

    const close = () => {
        setFixedHost(null);
        setSharing(false);
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
                        ? "h-dvh max-h-dvh rounded-none pb-[env(safe-area-inset-bottom)]"
                        : "w-[448px] max-w-[92vw] sm:max-w-[448px]",
                )}
            >
                <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                    {/* The phone board's big title (P2, `fix/WXNPublish`). */}
                    <SheetTitle
                        className={cn(
                            "flex-1 font-sans",
                            phone
                                ? "text-[1.75rem] font-bold leading-tight"
                                : "text-base",
                        )}
                    >
                        {title}
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
                        <>
                            <PublishLiveBody live={wentLive} />
                            <LeftOutLine live={wentLive} changes={changes} />
                        </>
                    ) : (
                        <>
                            {list?.livePublishedAt ? (
                                <p className="text-sm text-muted-foreground">
                                    Visitors still see the version published on{" "}
                                    {formatDate(list.livePublishedAt, zone)}.
                                    {total > 0
                                        ? " Leave out anything that isn’t ready: it stays in the draft and nothing is lost."
                                        : ""}
                                </p>
                            ) : null}
                            <PrePublishChecks
                                siteId={siteId}
                                flags={flags}
                                pages={pages}
                                onShow={(f) => onJump(f.pageId, f.sectionIndex)}
                                onChanged={onFlagsChanged}
                            />
                            {siteWide ? (
                                <Notice tone="error" role="note">
                                    {canOverride
                                        ? `This site goes live only from an approved test link. As an owner you can publish without approval. ${OVERRIDE_RECORD}`
                                        : "This site goes live only from an approved test link. Make a test link and ask for a review."}
                                </Notice>
                            ) : null}
                            {overriding ? (
                                <Notice tone="error" role="note">
                                    {`You put in changes nobody has approved yet. ${OVERRIDE_RECORD}`}
                                </Notice>
                            ) : null}
                            {scheduledWarning ? (
                                <Notice>{scheduledWarning}</Notice>
                            ) : null}
                            {review ? (
                                <ApprovalLine review={review} zone={zone} />
                            ) : null}
                            <PublishFlags
                                part="blockers"
                                flags={listed}
                                pages={pages}
                                addressFix={addressFix}
                                fixedHost={fixedHost}
                                onAddressSaved={(host) => {
                                    setFixedHost(host);
                                    onAddressSaved(host);
                                }}
                                onJump={onJump}
                            />
                            {list && total > 0 ? (
                                <PublishChanges
                                    siteId={siteId}
                                    changes={list}
                                    leftOut={changes?.leftOut ?? new Set()}
                                    canOverride={canOverride}
                                    zone={zone}
                                    onToggle={(key) => changes?.toggle(key)}
                                    onAsk={onAsk}
                                />
                            ) : changes?.read === "loading" ? (
                                <p
                                    className="text-sm text-muted-foreground"
                                    aria-busy
                                >
                                    Reading what changed…
                                </p>
                            ) : (
                                <>
                                    {changes?.read === "failed" ? (
                                        <p className="text-sm">
                                            Couldn’t list the changes one by
                                            one.{" "}
                                            <Button
                                                type="button"
                                                variant="link"
                                                size="inline"
                                                className="font-semibold"
                                                onClick={() =>
                                                    void changes.load()
                                                }
                                            >
                                                Try again
                                            </Button>
                                        </p>
                                    ) : null}
                                    <GoingLive
                                        {...{
                                            neverPublished,
                                            pendingKnown,
                                            pendingSummary,
                                            pendingChanges,
                                            pendingSiteChanges,
                                        }}
                                    />
                                </>
                            )}
                            <PublishFlags
                                part="advice"
                                flags={listed}
                                pages={pages}
                                addressFix={addressFix}
                                fixedHost={fixedHost}
                                onAddressSaved={onAddressSaved}
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
                            onTellPeople={
                                share ? () => setSharing(true) : undefined
                            }
                        />
                    ) : (
                        <div className="grid gap-2">
                            {more ? (
                                <MoreRow more={more} phone={phone} />
                            ) : null}
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
                                        ) : (
                                            <span className="block text-xs text-muted-foreground">
                                                What you left out is kept.
                                            </span>
                                        )}
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
                                    // An owner's override is the destructive
                                    // kind of publish: it goes past a rule
                                    // the business set.
                                    variant={
                                        siteWide || overriding
                                            ? "destructive"
                                            : "default"
                                    }
                                    disabled={
                                        unsaved ||
                                        blockers.length > 0 ||
                                        nothingIn ||
                                        (siteWide && !canOverride)
                                    }
                                    onClick={() =>
                                        onPublish({
                                            leaveOut: list
                                                ? Array.from(
                                                      changes?.leftOut ?? [],
                                                  )
                                                : [],
                                            overriding,
                                        })
                                    }
                                    busy={publishing}
                                    busyLabel="Publishing…"
                                    data-publish-now=""
                                >
                                    {label}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </SheetContent>
            {share && wentLive ? (
                <SharePageSheet
                    open={sharing}
                    onClose={() => setSharing(false)}
                    siteId={siteId}
                    page={share.page}
                    business={share.business}
                    host={share.host}
                    justPublished
                />
            ) : null}
        </Sheet>
    );
}
