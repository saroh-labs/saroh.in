"use client";

import { PageSections, SiteTheme } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createComment } from "@/lib/sites/actions";
import { shortDate } from "@/lib/sites/format-date";
import type { ReviewableSection, SiteCommentView } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * The class this reader's tokens are scoped to. A literal, for the same reason
 * the editor's preview gives: Tailwind and the selector must be one string.
 */
const SCOPE = "review-scope";

/**
 * What each block is called in words, for a section whose content names
 * nothing. Without it the composer asked for "your note about this richText
 * section", which is the database's word, not a merchant's.
 */
const SECTION_NAME: Record<string, string | undefined> = {
    hero: "this opening section",
    richText: "this block of writing",
    cta: "this call to action",
    gallery: "this gallery",
    features: "these features",
    enquiry: "this enquiry form",
    booking: "this booking section",
};

/**
 * The draft as a reviewer reads it (#275): the whole page, continuous, the way
 * a visitor would meet it.
 *
 * Reading comes first. The page is drawn by the blocks the live site uses with
 * nothing of Saroh's between the sections — a page broken into labelled cards
 * is a review of the cards, and whether the third section follows the second is
 * exactly what a second pair of eyes is for.
 *
 * Commenting is a MODE, not furniture. Turn it on and each section becomes
 * something to point at; turn it off and the page is a page again.
 */
export function SectionReview({
    siteId,
    pageId,
    sections,
    comments,
    style,
    styleOptions,
    canComment,
}: {
    siteId: string;
    pageId: string;
    sections: ReviewableSection[];
    comments: SiteCommentView[];
    style: SiteStyle | null;
    styleOptions: SiteStyleOptions | null;
    canComment: boolean;
}) {
    const [commenting, setCommenting] = useState(false);
    const [openFor, setOpenFor] = useState<string | null>(null);

    const vars =
        style && styleOptions
            ? resolveStyleVariables(style, styleOptions)
            : undefined;

    if (sections.length === 0) {
        return (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                This page has no sections yet. There is nothing to read here
                until someone adds one.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {canComment ? (
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        size="sm"
                        variant={commenting ? "secondary" : "outline"}
                        aria-pressed={commenting}
                        onClick={() => {
                            setCommenting((on) => !on);
                            setOpenFor(null);
                        }}
                    >
                        {commenting ? "Done commenting" : "Comment on sections"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        {commenting
                            ? "Point at a section to leave a note on it."
                            : "Reading the page as a visitor would see it."}
                    </p>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border">
                <SiteTheme variables={vars} selector={`.${SCOPE}`} />
                <div
                    className={`${SCOPE} bg-[hsl(var(--site-bg))] text-[hsl(var(--site-fg))]`}
                >
                    {sections.map((section) => (
                        <SectionSlot
                            key={section.key}
                            siteId={siteId}
                            pageId={pageId}
                            section={section}
                            notes={comments.filter(
                                (c) =>
                                    c.sectionKey === section.key &&
                                    c.pageId === pageId,
                            )}
                            commenting={commenting}
                            open={openFor === section.key}
                            onOpen={() =>
                                setOpenFor((k) =>
                                    k === section.key ? null : section.key,
                                )
                            }
                            onClose={() => setOpenFor(null)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SectionSlot({
    siteId,
    pageId,
    section,
    notes,
    commenting,
    open,
    onOpen,
    onClose,
}: {
    siteId: string;
    pageId: string;
    section: ReviewableSection;
    notes: SiteCommentView[];
    commenting: boolean;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
}) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [saving, setSaving] = useState(false);

    const openNotes = notes.filter((n) => n.resolvedAt === null).length;

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (text.length === 0) return;
        setSaving(true);
        const res = await createComment(siteId, {
            pageId,
            sectionKey: section.key,
            body: text,
        });
        setSaving(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setBody("");
        onClose();
        showSuccess("Note added.");
        router.refresh();
    }

    return (
        <div className="group relative">
            {/*
             * INERT: the blocks post to the public API, and an enquiry form
             * filled in while reading must not send a real lead. The note
             * controls are SIBLINGS of this, never children — inert would
             * swallow their clicks too.
             */}
            <div
                inert
                className={cn(
                    commenting &&
                        "group-hover:ring-2 group-hover:ring-inset group-hover:ring-ring",
                    open && "ring-2 ring-inset ring-ring",
                )}
            >
                <PageSections
                    sections={[
                        { type: section.type, content: section.content },
                    ]}
                />
            </div>

            {commenting ? (
                <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-2">
                    {section.hidden ? (
                        // Part of the draft and not part of the site: a
                        // reviewer reading past it in silence would be
                        // reviewing something visitors never see.
                        <span className="rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                            Hidden when published
                        </span>
                    ) : null}
                    {openNotes > 0 ? (
                        <span className="rounded bg-background/90 px-2 py-1 text-xs shadow-sm">
                            {openNotes === 1 ? "1 note" : `${openNotes} notes`}
                        </span>
                    ) : null}
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        /*
                         * Revealed on hover OR keyboard focus. Hover alone
                         * would put the whole feature out of reach of anyone
                         * not using a mouse.
                         */
                        className={cn(
                            "pointer-events-auto opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
                            open && "opacity-100",
                        )}
                        aria-expanded={open}
                        onClick={onOpen}
                    >
                        {open ? "Close" : "Note"}
                        <span className="sr-only">
                            {` on ${section.label ?? SECTION_NAME[section.type] ?? "this section"}`}
                        </span>
                    </Button>
                </div>
            ) : null}

            {commenting && open ? (
                <div className="space-y-3 border-y bg-background p-4">
                    {notes.length > 0 ? (
                        <ul className="space-y-2">
                            {notes.map((note) => (
                                <li
                                    key={note.id}
                                    className={cn(
                                        "rounded border p-2",
                                        note.resolvedAt !== null &&
                                            "opacity-60",
                                    )}
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-xs font-medium">
                                            {note.author.name}
                                        </span>
                                        <span className="text-[0.625rem] text-muted-foreground">
                                            {shortDate(note.createdAt)}
                                            {note.resolvedAt === null
                                                ? ""
                                                : " · settled"}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                        {note.body}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    <form onSubmit={submit} className="grid gap-2">
                        <label
                            htmlFor={`note-${section.key}`}
                            className="text-xs font-medium"
                        >
                            Your note about{" "}
                            {section.label ??
                                SECTION_NAME[section.type] ??
                                "this section"}
                        </label>
                        <textarea
                            id={`note-${section.key}`}
                            autoFocus
                            rows={3}
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            disabled={saving}
                            placeholder="What should change here?"
                            className="w-full rounded-md border border-input bg-background p-2 text-sm"
                        />
                        <div className="flex gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={saving || body.trim().length === 0}
                            >
                                {saving ? "Adding…" : "Add note"}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={saving}
                                onClick={() => {
                                    setBody("");
                                    onClose();
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </div>
            ) : null}
        </div>
    );
}
