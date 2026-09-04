"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MediaPicker } from "@/components/sites/media-picker";
import {
    createPost,
    deletePost,
    publishPost,
    unpublishPost,
    updatePost,
} from "@/lib/content/actions";
import type { PostCategory, PostDetail } from "@/lib/content/service";
import { exactDate, shortDate } from "@/lib/sites/format-date";

/* On demand and browser-only, for the same reasons as everywhere else it is
   used: the editor is heavy, and it is created in the browser. */
const RichTextEditor = dynamic(
    () =>
        import("@/components/sites/rich-text-editor").then(
            (m) => m.RichTextEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-64 animate-pulse rounded-md bg-muted/50" />
        ),
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

/** Long enough to be worth saying, short enough not to nag. */
const AUTOSAVE_MS = 2500;

export function PostEditor({
    siteId,
    categories,
    post,
}: {
    siteId: string;
    categories: PostCategory[];
    /** Absent when writing a new post. */
    post?: PostDetail;
}) {
    const router = useRouter();
    const [postId, setPostId] = useState(post?.id ?? null);

    const [title, setTitle] = useState(post?.title ?? "");
    const [content, setContent] = useState(post?.content ?? "");
    const [slug, setSlug] = useState(post?.slug ?? "");
    const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
    const [categoryId, setCategoryId] = useState(post?.categoryId ?? "");
    const [image, setImage] = useState(post?.image ?? "");

    const [live, setLive] = useState(post?.live ?? false);
    const [liveAt, setLiveAt] = useState<string | null>(post?.liveAt ?? null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [savedAt, setSavedAt] = useState<Date | null>(null);

    /**
     * The newest values, for a save fired from a timer — which closes over
     * whatever was current when it was scheduled, and would otherwise write
     * two-and-a-half seconds of stale text. Updated in an effect rather than
     * during render, because a render may be thrown away.
     */
    const latest = useRef({ title, content, slug, excerpt, categoryId, image });
    useEffect(() => {
        latest.current = { title, content, slug, excerpt, categoryId, image };
    }, [title, content, slug, excerpt, categoryId, image]);

    const save = useCallback(
        async (opts: { silent?: boolean } = {}) => {
            const v = latest.current;
            if (!v.title.trim()) {
                if (!opts.silent) toast.error("A post needs a title.");
                return null;
            }
            setSaving(true);
            const body = {
                title: v.title,
                slug: v.slug.trim() || undefined,
                excerpt: v.excerpt.trim() || undefined,
                content: v.content,
                categoryId: v.categoryId || undefined,
                image: v.image.trim() || undefined,
            };
            const res = postId
                ? await updatePost(siteId, postId, {
                      ...body,
                      slug: v.slug.trim() || slugFrom(v.title),
                  })
                : await createPost(siteId, body);
            setSaving(false);
            if (!res.ok) {
                toast.error(res.error);
                return null;
            }
            setDirty(false);
            setSavedAt(new Date());
            if (!postId && res.data.id) {
                // A new post becomes a real one on its first save, and the
                // address should say so — otherwise a reload loses the work.
                setPostId(res.data.id);
                router.replace(`/sites/${siteId}/posts/${res.data.id}`);
            }
            if (!opts.silent) toast.success("Draft saved.");
            return res.data.id;
        },
        [postId, router, siteId],
    );

    // Autosave, and only when there is something to save. An editor that loses
    // an hour of writing to a closed tab is not worth the simplicity.
    useEffect(() => {
        if (!dirty || !title.trim()) return;
        const t = setTimeout(() => void save({ silent: true }), AUTOSAVE_MS);
        return () => clearTimeout(t);
    }, [dirty, title, content, slug, excerpt, categoryId, image, save]);

    // The browser's own guard, for the case the timer has not yet fired.
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    function touched<T>(setter: (v: T) => void) {
        return (v: T) => {
            setter(v);
            setDirty(true);
        };
    }

    async function onPublish() {
        setPublishing(true);
        // Publish what is on screen, not what was last saved — the merchant
        // pressed publish looking at this.
        const id = dirty || !postId ? await save({ silent: true }) : postId;
        if (!id) {
            setPublishing(false);
            return;
        }
        const res = await publishPost(siteId, id);
        setPublishing(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setLive(true);
        setLiveAt(new Date().toISOString());
        toast.success(`Published. It is live at ${res.data.path}.`);
        router.refresh();
    }

    async function onUnpublish() {
        if (!postId) return;
        setPublishing(true);
        const res = await unpublishPost(siteId, postId);
        setPublishing(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setLive(false);
        setLiveAt(null);
        toast.success("Taken off the site. The writing is still here.");
        router.refresh();
    }

    async function onDelete() {
        if (!postId) return;
        const res = await deletePost(siteId, postId);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Post deleted.");
        router.push(`/sites/${siteId}/posts`);
    }

    return (
        <div className="flex min-h-[calc(100dvh-var(--app-header-h,3.5rem))] flex-col">
            <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2">
                <Button variant="ghost" size="sm" asChild className="-ml-2 h-7">
                    <Link href={`/sites/${siteId}/posts`}>← Posts</Link>
                </Button>

                {/* Which of the two states this is in, and — the part a
                    merchant cannot otherwise tell — whether the live copy is
                    behind what they are looking at. */}
                {live ? (
                    <Badge className="bg-success text-success-foreground">
                        Live
                    </Badge>
                ) : (
                    <Badge variant="outline">Draft</Badge>
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
                            ? `Saved ${shortDate(savedAt)}`
                            : liveAt
                              ? `Live since ${shortDate(liveAt)}`
                              : ""}
                </span>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDetailsOpen((v) => !v)}
                        aria-expanded={detailsOpen}
                    >
                        Details
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={saving || !dirty}
                        onClick={() => void save()}
                    >
                        Save draft
                    </Button>
                    {live ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={publishing}
                            onClick={() => void onUnpublish()}
                        >
                            Take off the site
                        </Button>
                    ) : null}
                    <Button
                        size="sm"
                        variant="brand"
                        className="h-7 text-xs"
                        disabled={publishing || !title.trim()}
                        onClick={() => void onPublish()}
                    >
                        {publishing
                            ? "Publishing…"
                            : live
                              ? "Publish changes"
                              : "Publish"}
                    </Button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                <div className="min-w-0 flex-1">
                    <div className="mx-auto w-full max-w-[68ch] px-6 py-10">
                        {/* The title is the document's own heading, not a
                            labelled field: this is the one place in the
                            product where a form would be the wrong metaphor. */}
                        <input
                            value={title}
                            onChange={(e) => touched(setTitle)(e.target.value)}
                            placeholder="Title"
                            aria-label="Post title"
                            className="w-full border-0 bg-transparent p-0 font-display text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
                        />
                        {/* Borderless on purpose: the title above is a
                            document heading, not a labelled field, and a boxed
                            body beneath it would make the page half document
                            and half form. The toolbar keeps its own rule. */}
                        <div className="mt-6">
                            <RichTextEditor
                                value={content}
                                onChange={touched(setContent)}
                                placeholder="Write…"
                                className="rounded-none border-0 bg-transparent [&>div:first-child]:border-0 [&>div:first-child]:px-0 [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:px-0"
                            />
                        </div>
                    </div>
                </div>

                {detailsOpen ? (
                    <aside className="w-80 shrink-0 space-y-5 border-l p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">Details</h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1.5 text-xs"
                                onClick={() => setDetailsOpen(false)}
                            >
                                Close
                            </Button>
                        </div>

                        <Field
                            label="Address"
                            hint="The last part of the web address. Left empty, it follows the title."
                        >
                            <Input
                                value={slug}
                                onChange={(e) =>
                                    touched(setSlug)(e.target.value)
                                }
                                placeholder={slugFrom(title) || "post-address"}
                                aria-label="Post address"
                            />
                        </Field>

                        <Field
                            label="Summary"
                            hint="Shown on the index and in a share card."
                        >
                            <Textarea
                                value={excerpt}
                                rows={3}
                                onChange={(e) =>
                                    touched(setExcerpt)(e.target.value)
                                }
                                aria-label="Post summary"
                            />
                        </Field>

                        <Field label="Category">
                            <select
                                value={categoryId}
                                onChange={(e) =>
                                    touched(setCategoryId)(e.target.value)
                                }
                                aria-label="Post category"
                                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                            >
                                <option value="">None</option>
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
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
                                <MediaPicker
                                    onPick={(img) => touched(setImage)(img.src)}
                                />
                                <Input
                                    value={image}
                                    placeholder="or paste an image address"
                                    onChange={(e) =>
                                        touched(setImage)(e.target.value)
                                    }
                                    aria-label="Cover image address"
                                />
                            </div>
                        </Field>

                        {postId ? (
                            <div className="border-t pt-4">
                                <p className="text-xs text-muted-foreground">
                                    {liveAt
                                        ? `Live copy published ${exactDate(liveAt)}.`
                                        : "This post has never been published."}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "mt-2 h-7 px-1.5 text-xs",
                                        "text-destructive hover:text-destructive",
                                    )}
                                    onClick={() => void onDelete()}
                                >
                                    Delete this post
                                </Button>
                            </div>
                        ) : null}
                    </aside>
                ) : null}
            </div>
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
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            {children}
            {hint ? (
                <p className="text-xs text-muted-foreground/80">{hint}</p>
            ) : null}
        </div>
    );
}

/** The same shape the api derives, so the placeholder does not lie. */
function slugFrom(title: string): string {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
