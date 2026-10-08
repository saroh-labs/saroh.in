"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useEffect } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import {
    APPROVAL_LINE,
    goesLive,
    TYPE_LABEL,
} from "@/components/sites/pre-publish-words";
import type {
    Flag,
    FlagType,
    ReviewState,
    SitePage,
} from "@/lib/sites/service";
import { OVERRIDE_RECORD } from "@/lib/sites/test-releases";

/**
 * The pre-publish check (spec §2, "Publish").
 *
 * "Pre-publish check is a full-screen takeover — its own moment before going
 * live. Flags grouped by page, phone check as its own group, approval line
 * where one exists. Each row jumps to the section."
 *
 * A takeover rather than a dialog on purpose: this is the last look at the
 * whole site before it becomes public, and a panel over the editor invites
 * skimming past it. Flags are advisory, so the primary action stays live and
 * never argues with the merchant about whether they are ready — with one
 * exception (DEC-069, L5): a site with no web address would go live at no
 * address, so its `blocking` flag holds the button and links to where the
 * address is chosen.
 */

/** Where the business's web address is chosen (Settings › Business, L4). */
export const WEB_ADDRESS_SETTINGS_HREF = "/settings/organization";

// The words live in pre-publish-words.ts; goesLive is re-exported for
// the callers that imported it from here.
export { goesLive };

export function PrePublishCheck({
    siteName,
    pages,
    flags,
    awaitingNavigation,
    publishing,
    unsaved,
    neverPublished,
    pendingSummary,
    pendingKnown,
    review,
    needsApproval = false,
    canOverride = false,
    scheduledWarning = null,
    onPublish,
    onClose,
    onJump,
}: {
    siteName: string;
    pages: SitePage[];
    flags: Flag[];
    awaitingNavigation: FlagType[];
    publishing: boolean;
    /**
     * Work not saved yet — the page, the look, the name or the footer.
     * Publishing now would put live what was saved before it, not what is
     * on screen, so the button waits (review G-1).
     */
    unsaved: boolean;
    /** Never-published sites say "Publish site", not "Publish changes". */
    neverPublished: boolean;
    /**
     * What publishing would change, as the server counted it: "2 sections
     * and the footer". Null when nothing is waiting (G2).
     */
    pendingSummary: string | null;
    /** Whether that count arrived; false says so rather than guess (G2). */
    pendingKnown: boolean;
    /** "Approval also shows as a line in the pre-publish check" (spec §2). */
    review: ReviewState;
    /**
     * "Publishing needs approval" is on (DEC-071, R10). Only an owner gets
     * here then, and their publish is the recorded override (KTD-11).
     */
    needsApproval?: boolean;
    canOverride?: boolean;
    /**
     * A test release is scheduled to go live, and publishing now means it
     * won't (KTD-14): said before, not discovered after.
     */
    scheduledWarning?: string | null;
    onPublish: () => void;
    onClose: () => void;
    /** Jump to a flag's section. Null pageId means a whole-site flag. */
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
    const zone = useBusinessZone();
    // Escape closes. A takeover with no way out but the mouse is a trap, and
    // this one sits between the merchant and the thing they came to do.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    /*
     * The phone check is its own group, per the spec — it is a different KIND
     * of problem from an empty field, and burying one phone flag under the page
     * it happens to sit on loses that.
     */
    const phone = flags.filter((f) => f.type === "phoneWidth");
    const rest = flags.filter((f) => f.type !== "phoneWidth");
    const siteWide = rest.filter((f) => f.pageId === null);
    const byPage = pages
        .map((page) => ({
            page,
            flags: rest.filter((f) => f.pageId === page.id),
        }))
        .filter((g) => g.flags.length > 0);

    const total = flags.length;
    // What the API will refuse to publish past (L5): the button waits.
    const blocked = flags.some((f) => f.blocking);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b px-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-sm font-semibold">
                        Before {siteName} goes live
                    </h1>
                    <span className="text-xs text-muted-foreground">
                        {total === 0
                            ? "Nothing outstanding."
                            : total === 1
                              ? "1 thing worth a look."
                              : `${total} things worth a look.`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={onClose}
                    >
                        Back to editing
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        // An owner's override is the destructive kind of
                        // publish: it goes past a rule the business set.
                        variant={needsApproval ? "destructive" : "default"}
                        disabled={
                            publishing ||
                            unsaved ||
                            blocked ||
                            (needsApproval && !canOverride)
                        }
                        title={
                            blocked
                                ? "Choose a web address first"
                                : unsaved
                                  ? "Saving your changes — publish is available in a moment"
                                  : undefined
                        }
                        onClick={onPublish}
                        className="h-8 px-3"
                    >
                        {publishing
                            ? "Publishing…"
                            : needsApproval || review.outstanding
                              ? "Publish without approval"
                              : neverPublished
                                ? "Publish site"
                                : "Publish changes"}
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl px-6 py-8">
                    {/*
                     * What pressing Publish puts live (G2), said before it
                     * does it. The same count the bar's pill reads.
                     */}
                    <p className="mb-6 text-sm">
                        {goesLive(neverPublished, pendingKnown, pendingSummary)}
                    </p>
                    {/*
                     * "Publishing needs approval" (DEC-071): what pressing
                     * Publish here leaves behind, named before it happens.
                     */}
                    {needsApproval ? (
                        <p
                            role="note"
                            className="mb-6 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive-subtle-foreground"
                        >
                            {canOverride
                                ? `This site goes live only from an approved test release. As an owner you can publish without approval. ${OVERRIDE_RECORD}`
                                : "This site goes live only from an approved test release. Make a test release and ask for a review."}
                        </p>
                    ) : null}
                    {scheduledWarning ? (
                        <p
                            role="note"
                            className="mb-6 rounded-md border px-3 py-2 text-sm text-muted-foreground"
                        >
                            {scheduledWarning}
                        </p>
                    ) : null}
                    {/*
                     * The approval, where the spec puts it: this is the last
                     * look before going live, and whether someone has signed
                     * the site off belongs beside what is still outstanding
                     * rather than only in the editor behind it.
                     */}
                    {review.latestApproval === null ? null : (
                        <p
                            className={
                                APPROVAL_LINE[review.latestApproval.outcome]
                                    .approved
                                    ? "mb-6 rounded-md bg-brand-subtle px-3 py-2 text-sm text-brand-subtle-foreground"
                                    : "mb-6 rounded-md border px-3 py-2 text-sm text-muted-foreground"
                            }
                        >
                            {APPROVAL_LINE[review.latestApproval.outcome].text(
                                review.latestApproval,
                                zone,
                            )}
                            {review.openNotes > 0
                                ? `, with ${review.openNotes} ${review.openNotes === 1 ? "note" : "notes"} still open.`
                                : "."}
                            {/*
                             * Which of the two things publishing is about to
                             * do (#199), said before it does it. The epic's
                             * rule is recorded, not prevented — so the button
                             * still works, and this line is the record's
                             * warning.
                             */}
                            {review.outstanding ? (
                                <span className="mt-1 block">
                                    A reviewer&apos;s request for changes is
                                    still open. Publishing now goes ahead
                                    without approval, and records that it did —
                                    here and in version history.
                                </span>
                            ) : null}
                        </p>
                    )}

                    {total === 0 ? (
                        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                            Everything checks out. Publish when you are ready.
                        </p>
                    ) : (
                        <div className="space-y-8">
                            {siteWide.length > 0 ? (
                                <Group title="This site">
                                    {siteWide.map((flag, i) => (
                                        <Row
                                            key={i}
                                            flag={flag}
                                            onJump={onJump}
                                        />
                                    ))}
                                </Group>
                            ) : null}

                            {byPage.map(({ page, flags: pageFlags }) => (
                                <Group
                                    key={page.id}
                                    title={page.title}
                                    note={page.path}
                                >
                                    {pageFlags.map((flag, i) => (
                                        <Row
                                            key={i}
                                            flag={flag}
                                            onJump={onJump}
                                        />
                                    ))}
                                </Group>
                            ))}

                            {phone.length > 0 ? (
                                <Group
                                    title="On a phone"
                                    note="Most visitors will see the site this way"
                                >
                                    {phone.map((flag, i) => (
                                        <Row
                                            key={i}
                                            flag={flag}
                                            onJump={onJump}
                                            page={pages.find(
                                                (p) => p.id === flag.pageId,
                                            )}
                                        />
                                    ))}
                                </Group>
                            ) : null}
                        </div>
                    )}

                    {/*
                     * Said plainly rather than left implied. A check that
                     * silently does not run two of its nine tests would let a
                     * merchant read "nothing outstanding" as more than it is.
                     */}
                    {awaitingNavigation.length > 0 ? (
                        <p className="mt-10 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                            Two checks are not running yet — whether a hidden
                            section is still linked from your navigation, and
                            whether a page is missing from it. Saroh does not
                            manage your navigation yet.
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function Group({
    title,
    note,
    children,
}: {
    title: string;
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <h2 className="flex items-baseline gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {title}
                {note === undefined ? null : (
                    <span className="font-mono text-[11px] normal-case tracking-normal opacity-70">
                        {note}
                    </span>
                )}
            </h2>
            <ul className="mt-2 divide-y rounded-md border">{children}</ul>
        </section>
    );
}

function Row({
    flag,
    page,
    onJump,
}: {
    flag: Flag;
    page?: SitePage;
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
    if (flag.type === "addressMissing") {
        // Nothing in the editor fixes this: the address is the business's,
        // chosen in Settings › Business, so the row goes there.
        return (
            <li>
                <Link
                    href={WEB_ADDRESS_SETTINGS_HREF}
                    className="flex w-full cursor-pointer items-start gap-3 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70"
                >
                    <span
                        aria-hidden="true"
                        className="mt-1.5 size-1 shrink-0 rounded-full bg-destructive"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block text-sm">{flag.message}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                            {TYPE_LABEL[flag.type]} · Choose one in Settings ›
                            Business
                        </span>
                    </span>
                </Link>
            </li>
        );
    }
    return (
        <li>
            <button
                type="button"
                onClick={() => onJump(flag.pageId, flag.sectionIndex)}
                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted"
            >
                {/* The design's flag dot: 4px, amber #c99f6f (spec §7). */}
                <span
                    aria-hidden="true"
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-highlight"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm">{flag.message}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                        {TYPE_LABEL[flag.type]}
                        {page === undefined ? "" : ` · ${page.title}`}
                    </span>
                </span>
            </button>
        </li>
    );
}
