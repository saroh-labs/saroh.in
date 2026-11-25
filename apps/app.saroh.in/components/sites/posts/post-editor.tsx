"use client";

import { EditorLoading } from "@/components/sites/rich-text/editor-loading";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { POST_TITLE_MAX } from "@saroh/api-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PausedNote } from "@/components/billing/paused-banner";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { MediaPicker } from "@/components/shared/fields/media-picker";
import { ShareItemButton } from "@/components/shared/share-item/share-item-sheet";
import { accountSettingsUrl } from "@/lib/accounts";
import { pausedWords } from "@/lib/billing/paused";
import { postParagraphs } from "@/lib/content/plain-text";
import type { PostCategory, PostDetail } from "@/lib/content/service";
import type { ShareSetup } from "@/lib/share-item/share";
import type { SiteCommentView } from "@/lib/sites/service";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { EmptyState } from "@saroh/ui/data-state";
import { OptionSelect } from "@saroh/ui/option-select";

import {
    adoptPostAddress,
    slugFrom,
    usePostDraft,
} from "./editor/use-post-draft";
import { PostFeedback } from "./post-feedback";

/* On demand and browser-only, for the same reasons as everywhere else it is
   used: the editor is heavy, and it is created in the browser. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => <EditorLoading className="min-h-64" />,
    },
);

/**
 * Writing a post (#232).
 *
 * DOCUMENT-SHAPED, not the three-pane editor. Pages are assembled from
 * sections and want a canvas beside a field list; a post is prose and wants
 * width. Everything that is not the writing — the address, the summary, the
 * cover, the category — lives behind **Details**, because it is decided once
 * and the words are worked on for an hour.
 *
 * Saving is explicit and publishing is separate, mirroring the site editor: a
 * draft is saved as often as you like, and the public sees nothing until the
 * moment you say so. The header states which of the two the post is in, and
 * whether the live copy is behind the draft — the one thing a merchant cannot
 * otherwise tell.
 */

export { adoptPostAddress };

/** Open in editor from an Ask AI blog draft (owner, 14 Nov): one quiet line. */
export const FROM_ASK_AI =
    "Started from Ask AI. Nothing is saved until you save.";
export const ASK_AI_GONE = "That Ask AI draft isn't available any more.";

export function PostEditor({
    siteId,
    categories,
    post,
    paused = false,
    readOnly = false,
    feedback,
    share = null,
    fromAskAi,
}: {
    /**
     * A new post started from an Ask AI blog draft, unsaved: its title,
     * body (the editor's HTML) and excerpt; null when the draft couldn't be
     * read, and the post starts empty. Saving is the editor's own.
     */
    fromAskAi?: { title: string; body: string; excerpt: string | null } | null;
    /**
     * Share as a post (#1375, boards SGShareBlog*): the live site and the
     * post's live address. Shown only while the post is live.
     */
    share?: { setup: ShareSetup; url: string } | null;
    siteId: string;
    categories: PostCategory[];
    /** Absent when writing a new post. */
    post?: PostDetail;
    /**
     * Past the plan's blog posts limit (#800): hidden from the site and
     * read-only. Save and Publish are off and the note says why; taking
     * it off the site stays, as that only ever lowers the count.
     */
    paused?: boolean;
    /**
     * Someone who may read the site's writing but not change it, a
     * Reviewer or a Member (DEC-200 U8): the same editor, every field shown
     * and none changeable, and no Save, Publish, take-down or delete.
     */
    readOnly?: boolean;
    /** This post's notes, and what the caller may do with them. */
    feedback?: {
        comments: SiteCommentView[];
        canComment: boolean;
        canSettle: boolean;
    };
}) {
    const zone = useBusinessZone();
    const router = useRouter();
    const [confirmDelete, setConfirmDelete] = useState(false);
    // Today's editor keeps its own address for a new post's first save.
    const addressOf = useCallback(
        (id: string) => `/sites/${siteId}/posts/${id}`,
        [siteId],
    );
    const draft = usePostDraft({
        siteId,
        post,
        fromAskAi,
        paused,
        readOnly,
        addressOf,
        listHref: `/sites/${siteId}/posts`,
    });
    const { postId, live, liveAt, dirty, saving, publishing, savedAt, guard } =
        draft;
    const { title, content, slug, excerpt, categoryId, image } = draft.fields;
    const save = draft.save;
    const onPublish = draft.publish;
    const onUnpublish = draft.unpublish;
    const onDelete = draft.remove;
    const touched = draft.set;

    /** The one side panel open: Details, Feedback, or neither. */
    const [panel, setPanel] = useState<"details" | "feedback" | null>(
        readOnly && feedback ? "feedback" : null,
    );
    const detailsOpen = panel === "details";
    const openNotes =
        feedback?.comments.filter((c) => c.resolvedAt === null).length ?? 0;

    // The title grows with its text where `field-sizing` isn't supported.
    const titleRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const box = titleRef.current;
        if (!box) return;
        box.style.height = "auto";
        box.style.height = `${box.scrollHeight}px`;
    }, [title]);

    return (
        <div className="flex min-h-[calc(100dvh-var(--app-header-h,3.5rem))] flex-col">
            <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2">
                <Button variant="ghost" size="xs" asChild className="-ml-2">
                    <IntentLink href={`/sites/${siteId}/posts`}>
                        ← Posts
                    </IntentLink>
                </Button>

                {/* Which of the two states this is in, and — the part a
                    merchant cannot otherwise tell — whether the live copy is
                    behind what they are looking at. */}
                {live ? (
                    <Badge className="bg-success text-success-foreground">
                        Live
                    </Badge>
                ) : (
                    <Badge variant="outline">Not live yet</Badge>
                )}
                {live && dirty ? (
                    <span className="text-xs text-warning">
                        Edited since it went live
                    </span>
                ) : null}

                <span className="text-xs text-muted-foreground">
                    {saving
                        ? "Saving…"
                        : dirty
                          ? "Unsaved changes"
                          : savedAt
                            ? `Saved ${formatDate(savedAt, zone)}`
                            : liveAt
                              ? `Live since ${formatDate(liveAt, zone)}`
                              : ""}
                </span>

                {readOnly ? (
                    <span className="text-xs text-muted-foreground">
                        Reviewing · you can&apos;t change anything
                    </span>
                ) : null}

                <div className="ml-auto flex items-center gap-2">
                    {feedback && postId ? (
                        <Button
                            variant="outline"
                            size="xs"
                            onClick={() =>
                                setPanel((v) =>
                                    v === "feedback" ? null : "feedback",
                                )
                            }
                            aria-expanded={panel === "feedback"}
                        >
                            Feedback{openNotes > 0 ? ` · ${openNotes}` : ""}
                        </Button>
                    ) : null}
                    {share && live && postId ? (
                        <ShareItemButton
                            setup={share.setup}
                            item={{
                                kind: "post",
                                // The saved address, which the live copy has.
                                ref: post?.slug ?? slug,
                                name: title,
                                price: null,
                                url: share.url,
                                offerId: null,
                                hasPhoto: Boolean(image.trim()),
                                summary: excerpt,
                            }}
                        />
                    ) : null}
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={() =>
                            setPanel((v) =>
                                v === "details" ? null : "details",
                            )
                        }
                        aria-expanded={detailsOpen}
                    >
                        Details
                    </Button>
                    {readOnly ? null : (
                        <>
                            <Button
                                variant="ghost"
                                size="xs"
                                // An Ask AI prefill is unsaved though untouched: Save takes it.
                                disabled={
                                    paused ||
                                    (!dirty && !(fromAskAi && !postId))
                                }
                                busy={saving}
                                busyLabel="Saving…"
                                onClick={() => void save()}
                            >
                                Save draft
                            </Button>
                            {live ? (
                                <Button
                                    variant="outline"
                                    size="xs"
                                    disabled={publishing}
                                    onClick={() => void onUnpublish()}
                                >
                                    Take off the site
                                </Button>
                            ) : null}
                            <Button
                                size="xs"
                                variant="brand"
                                disabled={paused || !title.trim()}
                                onClick={() => void onPublish()}
                                busy={publishing}
                                busyLabel="Publishing…"
                            >
                                {live ? "Publish changes" : "Publish"}
                            </Button>
                        </>
                    )}
                </div>
            </header>
            {paused ? (
                <PausedNote className="mx-4 mt-3 sm:mx-6">
                    {pausedWords("post")}
                </PausedNote>
            ) : fromAskAi !== undefined && !postId ? (
                <p
                    role="status"
                    className="mx-4 mb-0 mt-3 text-[13px] text-muted-foreground sm:mx-6"
                >
                    {fromAskAi ? FROM_ASK_AI : ASK_AI_GONE}
                </p>
            ) : null}

            <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                    <div className="mx-auto w-full max-w-[68ch] px-6 py-10">
                        {/* The title is the document's own heading, not a
                            labelled field: this is the one place in the
                            product where a form would be the wrong metaphor. */}
                        {/* A long title wraps onto more lines, as a heading
                            does; it stays one line of text (Enter adds no
                            break, and a pasted one becomes a space). */}
                        <Textarea
                            ref={titleRef}
                            rows={1}
                            maxLength={POST_TITLE_MAX}
                            value={title}
                            readOnly={readOnly}
                            onChange={(e) =>
                                touched("title")(
                                    e.target.value.replace(/\s*\n+\s*/g, " "),
                                )
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                            }}
                            placeholder="Title"
                            aria-label="Post title"
                            className="block min-h-0 w-full resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 font-display text-4xl font-bold leading-tight tracking-tight outline-none [field-sizing:content] placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 coarse:text-4xl"
                        />
                        {/* Borderless on purpose: the title above is a
                            document heading, not a labelled field, and a boxed
                            body beneath it would make the page half document
                            and half form. The toolbar keeps its own rule. */}
                        {readOnly ? (
                            <ReadOnlyBody content={content} />
                        ) : (
                            <div className="mt-6">
                                <RichTextEditor
                                    value={content}
                                    onChange={touched("content")}
                                    placeholder="Write…"
                                    className="rounded-none border-0 bg-transparent [&>div:first-child]:border-0 [&>div:first-child]:px-0 [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:px-0"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {panel === "feedback" && feedback && postId ? (
                    <aside className="w-80 shrink-0 space-y-4 border-l p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Feedback</h2>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="px-1.5"
                                onClick={() => setPanel(null)}
                            >
                                Close
                            </Button>
                        </div>
                        <PostFeedback
                            siteId={siteId}
                            postId={postId}
                            title={title}
                            {...feedback}
                            onChanged={() => router.refresh()}
                        />
                    </aside>
                ) : null}

                {detailsOpen ? (
                    <aside className="w-80 shrink-0 space-y-5 border-l p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Details</h2>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="px-1.5"
                                onClick={() => setPanel(null)}
                            >
                                Close
                            </Button>
                        </div>

                        {post?.author ? (
                            <Field label="Written by">
                                {/* Said where it comes from (UX-091): the
                                    writer's own account name, shown on the
                                    public post, and changed there. */}
                                <p className="text-sm">
                                    Shown on the site as by{" "}
                                    <span className="font-medium">
                                        {post.author}
                                    </span>
                                    .
                                    {readOnly ? null : (
                                        <>
                                            {" "}
                                            <a
                                                href={accountSettingsUrl}
                                                className="underline underline-offset-2"
                                            >
                                                Change your name
                                            </a>
                                        </>
                                    )}
                                </p>
                            </Field>
                        ) : null}

                        <Field
                            label="Post path"
                            hint="The end of the post's link. Left empty, it follows the title."
                        >
                            <Input
                                value={slug}
                                disabled={readOnly}
                                onChange={(e) =>
                                    touched("slug")(e.target.value)
                                }
                                placeholder={slugFrom(title) || "post-path"}
                                aria-label="Post path"
                            />
                        </Field>

                        <Field
                            label="Summary"
                            hint="Shown on the index and in a share card."
                        >
                            <Textarea
                                value={excerpt}
                                disabled={readOnly}
                                rows={3}
                                onChange={(e) =>
                                    touched("excerpt")(e.target.value)
                                }
                                aria-label="Post summary"
                            />
                        </Field>

                        <Field label="Category">
                            <OptionSelect
                                aria-label="Post category"
                                value={categoryId}
                                disabled={readOnly}
                                onValueChange={(v) => {
                                    touched("categoryId")(v);
                                }}
                                options={[
                                    { value: "", label: "None" },
                                    ...categories.map((c) => ({
                                        value: c.id,
                                        label: c.name,
                                    })),
                                ]}
                                className="w-full"
                            />
                        </Field>

                        <Field
                            label="Cover"
                            hint="Shown above the post, and used as its share card."
                        >
                            <div className="space-y-2">
                                {image ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied absolute URL
                                    <img
                                        src={image}
                                        alt=""
                                        className="aspect-[1.91/1] w-full rounded border object-cover"
                                    />
                                ) : null}
                                {readOnly ? null : (
                                    <MediaPicker
                                        onPick={(img) =>
                                            touched("image")(img.src)
                                        }
                                    />
                                )}
                                <Input
                                    value={image}
                                    disabled={readOnly}
                                    placeholder="or paste an image address"
                                    onChange={(e) =>
                                        touched("image")(e.target.value)
                                    }
                                    aria-label="Cover image address"
                                />
                            </div>
                        </Field>

                        {postId ? (
                            <div className="border-t pt-4">
                                <p className="text-xs text-muted-foreground">
                                    {liveAt
                                        ? `Live copy published ${formatDateTime(liveAt, zone, { year: "always" })}.`
                                        : "This post has never been published."}
                                </p>
                                {readOnly ? null : (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            className={cn(
                                                "mt-2 px-1.5",
                                                "text-destructive hover:text-destructive",
                                            )}
                                            onClick={() =>
                                                setConfirmDelete(true)
                                            }
                                        >
                                            Delete this post
                                        </Button>
                                        <ConfirmDialog
                                            open={confirmDelete}
                                            onOpenChange={setConfirmDelete}
                                            title="Delete this post?"
                                            description={
                                                liveAt
                                                    ? "It comes off the site and out of your posts, and its link stops working for anyone who saved it. To take it down and keep it, use Take off the site instead. This cannot be undone."
                                                    : "It has never been published, so nobody outside your team has seen it. This cannot be undone."
                                            }
                                            confirmLabel="Delete post"
                                            keepLabel="Keep post"
                                            onConfirm={onDelete}
                                        />
                                    </>
                                )}
                            </div>
                        ) : null}
                    </aside>
                ) : null}
            </div>
            {guard.dialog}
        </div>
    );
}

/**
 * The body for a reader (DEC-200 U8). Plain text, as the read view drew it:
 * a draft's markup is sanitized only at publish, so it is never drawn as
 * markup for someone who didn't write it.
 */
export function ReadOnlyBody({ content }: { content: string }) {
    const body = postParagraphs(content);
    return (
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
            {body.length > 0 ? (
                body.map((paragraph, index) => <p key={index}>{paragraph}</p>)
            ) : (
                <EmptyState
                    size="inline"
                    title="Nothing has been written in this post yet"
                />
            )}
            <p className="text-[12.5px] text-muted-foreground">
                Shown as plain text. Its formatting and pictures show on the
                site once it is published.
            </p>
        </div>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <span className="label">{label}</span>
            {children}
            {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
