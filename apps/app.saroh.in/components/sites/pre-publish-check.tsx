"use client";

import { Button } from "@saroh/ui/button";
import { useEffect } from "react";

import type {
    Flag,
    FlagType,
    ReviewState,
    SitePage,
} from "@/lib/sites/service";

/**
 * The pre-publish check (spec §2, "Publish").
 *
 * "Pre-publish check is a full-screen takeover — its own moment before going
 * live. Flags grouped by page, phone check as its own group, approval line
 * where one exists. Each row jumps to the section."
 *
 * A takeover rather than a dialog on purpose: this is the last look at the
 * whole site before it becomes public, and a panel over the editor invites
 * skimming past it. Nothing here blocks publishing — every flag is advisory,
 * so the primary action stays live at all times and never argues with the
 * merchant about whether they are ready.
 */

/** The spec's voice: warm, a little human. Group headings, not error codes. */
const TYPE_LABEL: Record<FlagType, string> = {
    emptyRequiredField: "Nothing filled in yet",
    placeholderText: "Placeholder text still in place",
    missingImage: "No image yet",
    hiddenButLinked: "Hidden but linked from navigation",
    pageNotInNavigation: "Not in the navigation",
    unpublishedChanges: "Changes visitors cannot see yet",
    missingSeoDescription: "No search description",
    brokenLink: "Link goes nowhere",
    phoneWidth: "Breaks at phone width",
};

export function PrePublishCheck({
    siteName,
    pages,
    flags,
    awaitingNavigation,
    publishing,
    neverPublished,
    review,
    onPublish,
    onClose,
    onJump,
}: {
    siteName: string;
    pages: SitePage[];
    flags: Flag[];
    awaitingNavigation: FlagType[];
    publishing: boolean;
    /** Never-published sites say "Publish site", not "Publish changes". */
    neverPublished: boolean;
    /** "Approval also shows as a line in the pre-publish check" (spec §2). */
    review: ReviewState;
    onPublish: () => void;
    onClose: () => void;
    /** Jump to a flag's section. Null pageId means a whole-site flag. */
    onJump: (pageId: string | null, sectionIndex: number | null) => void;
}) {
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
                        disabled={publishing}
                        onClick={onPublish}
                        className="h-7 bg-[#8a5a3c] px-3 text-xs font-medium text-white hover:bg-[#794e34]"
                    >
                        {publishing
                            ? "Publishing…"
                            : neverPublished
                              ? "Publish site"
                              : "Publish changes"}
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl px-6 py-8">
                    {/*
                     * The approval, where the spec puts it: this is the last
                     * look before going live, and whether someone has signed
                     * the site off belongs beside what is still outstanding
                     * rather than only in the editor behind it.
                     */}
                    {review.latestApproval === null ? null : (
                        <p
                            className={
                                review.latestApproval.outcome === "APPROVED"
                                    ? "mb-6 rounded-md border border-[#3d3020] bg-[#241d14] px-3 py-2 text-sm text-[#c99f6f]"
                                    : "mb-6 rounded-md border px-3 py-2 text-sm text-muted-foreground"
                            }
                        >
                            {review.latestApproval.outcome === "APPROVED"
                                ? `${review.latestApproval.by} approved this site`
                                : `${review.latestApproval.by} asked for changes`}
                            {review.openNotes > 0
                                ? `, with ${review.openNotes} ${review.openNotes === 1 ? "note" : "notes"} still open.`
                                : "."}
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
                    <span className="font-mono text-[0.625rem] normal-case tracking-normal opacity-70">
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
                    className="mt-1.5 size-1 shrink-0 rounded-full bg-[#c99f6f]"
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
