"use client";

import { useSaveShortcut } from "@saroh/ui/lib/keyboard-save";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useLeaveGuard } from "@saroh/ui/use-leave-guard";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { runAction } from "@/lib/api/run-action";
import {
    createPost,
    deletePost,
    publishPost,
    unpublishPost,
    updatePost,
} from "@/lib/content/actions";
import type { PostDetail } from "@/lib/content/service";

/** Long enough to be worth saying, short enough not to nag. */
export const AUTOSAVE_MS = 2500;

/** Every field a post's draft holds, as typed (empty is "none"). */
export interface PostFields {
    title: string;
    content: string;
    slug: string;
    excerpt: string;
    categoryId: string;
    image: string;
    /** The cover's description (U17a). */
    imageAlt: string;
    /** Title and description in search (U17a). */
    seoTitle: string;
    seoDescription: string;
}

/** An Ask AI blog draft the post starts from, unsaved. */
export interface AskAiStart {
    title: string;
    body: string;
    excerpt: string | null;
}

/**
 * Point the address bar at a post that now exists, without a navigation.
 * Next's router follows `history.replaceState`, so `usePathname` and a later
 * reload both see the new address, while the editor and what is typed in it
 * stay mounted.
 */
export function adoptPostAddress(path: string): void {
    window.history.replaceState(null, "", path);
}

/** The same shape the api derives, so the placeholder does not lie. */
export function slugFrom(title: string): string {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function fieldsOf(
    post: PostDetail | undefined,
    fromAskAi: AskAiStart | null | undefined,
): PostFields {
    return {
        title: post?.title ?? fromAskAi?.title ?? "",
        content: post?.content ?? fromAskAi?.body ?? "",
        slug: post?.slug ?? "",
        excerpt: post?.excerpt ?? fromAskAi?.excerpt ?? "",
        categoryId: post?.categoryId ?? "",
        image: post?.image ?? "",
        imageAlt: post?.imageAlt ?? "",
        seoTitle: post?.seoTitle ?? "",
        seoDescription: post?.seoDescription ?? "",
    };
}

/** What a save sends: the comparison that says whether it is still current. */
function bodyOf(v: PostFields) {
    return {
        title: v.title,
        slug: v.slug.trim() || undefined,
        excerpt: v.excerpt.trim() || undefined,
        content: v.content,
        categoryId: v.categoryId || undefined,
        image: v.image.trim() || undefined,
        // Null clears (U17a); the API keeps absent as unchanged.
        imageAlt: v.imageAlt.trim() || null,
        seoTitle: v.seoTitle.trim() || null,
        seoDescription: v.seoDescription.trim() || null,
    };
}

/**
 * A post's draft (#232): its fields, autosave, Save (⌘S), Publish, Take off
 * the site and Delete. Both post editors run on it: today's document editor
 * and the desk editor in the editor shell (U15), so the two never save
 * differently.
 *
 * Saving is explicit and publishing is separate: a draft is saved as often
 * as you like, and the public sees nothing until Publish.
 */
export function usePostDraft({
    siteId,
    post,
    fromAskAi,
    paused = false,
    readOnly = false,
    addressOf,
    listHref,
}: {
    siteId: string;
    post?: PostDetail;
    fromAskAi?: AskAiStart | null;
    paused?: boolean;
    readOnly?: boolean;
    /** Where a new post lives once its first save gives it an id. */
    addressOf: (postId: string) => string;
    /** Where Delete goes after. */
    listHref: string;
}) {
    const router = useRouter();
    const [postId, setPostId] = useState(post?.id ?? null);
    const [fields, setFields] = useState(() => fieldsOf(post, fromAskAi));
    const [live, setLive] = useState(post?.live ?? false);
    const [liveAt, setLiveAt] = useState<string | null>(post?.liveAt ?? null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    /** The last save didn't go: the words stay, Try again is offered. */
    const [saveFailed, setSaveFailed] = useState(false);

    /*
     * The newest values, for a save fired from a timer — which closes over
     * whatever was current when it was scheduled, and would otherwise write
     * two-and-a-half seconds of stale text. Updated in an effect rather than
     * during render, because a render may be thrown away.
     */
    const latest = useRef(fields);
    useEffect(() => {
        latest.current = fields;
    }, [fields]);

    /*
     * The save in flight, if any (#285). Before a NEW post's first save
     * returns, `postId` is still null — so two overlapping saves each took
     * the create branch and made a duplicate draft. A second caller waits
     * for the first rather than starting its own; Publish in particular
     * wants the id being minted.
     */
    const inFlight = useRef<Promise<string | null> | null>(null);

    const save = useCallback(
        async (opts: { silent?: boolean } = {}) => {
            if (inFlight.current) return inFlight.current;

            const run = (async () => {
                const v = latest.current;
                if (!v.title.trim()) {
                    if (!opts.silent) showError("A post needs a title.");
                    return null;
                }
                setSaving(true);
                const body = bodyOf(v);
                // What is being sent, so edits made WHILE it is in flight are
                // not marked saved when it returns.
                const sent = JSON.stringify(body);
                const res = await runAction(
                    () =>
                        postId
                            ? updatePost(siteId, postId, {
                                  ...body,
                                  slug: v.slug.trim() || slugFrom(v.title),
                              })
                            : createPost(siteId, body),
                    // An autosave that didn't get there says nothing: the
                    // next one, or Save, tries again.
                    { setBusy: setSaving, quiet: opts.silent },
                );
                if (!res) {
                    setSaveFailed(true);
                    return null;
                }
                if (!res.ok) {
                    setSaveFailed(true);
                    showError(res.error);
                    return null;
                }
                setSaveFailed(false);
                // Still dirty when the merchant kept typing: autosave fires
                // again for what they wrote.
                if (sent === JSON.stringify(bodyOf(latest.current))) {
                    setDirty(false);
                }
                setSavedAt(new Date());
                if (!postId && res.data.id) {
                    // The address changes in place (UX-034): a navigation
                    // remounted the editor from the server's copy, and
                    // whatever was typed while the save was out was lost.
                    setPostId(res.data.id);
                    adoptPostAddress(addressOf(res.data.id));
                }
                if (!opts.silent) showSuccess("Draft saved.");
                return res.data.id;
            })();

            inFlight.current = run;
            try {
                return await run;
            } finally {
                inFlight.current = null;
            }
        },
        [postId, siteId, addressOf],
    );

    // Autosave, and only when there is something to save. Never while one
    // is already running (#285), nor after one failed: Try again says when.
    useEffect(() => {
        if (!dirty || saving || saveFailed || !fields.title.trim()) return;
        const t = setTimeout(() => void save({ silent: true }), AUTOSAVE_MS);
        return () => clearTimeout(t);
    }, [dirty, saving, saveFailed, fields, save]);

    /*
     * Re-read the server's copy after publishing or taking a post down —
     * only when the editor opened on a saved post. A post begun as new
     * changed its address in place, so a refresh would remount the editor
     * over anything typed meanwhile (UX-034).
     */
    const refreshServer = useCallback(() => {
        if (post) router.refresh();
    }, [post, router]);

    // Cmd/Ctrl+S: Save draft, said aloud if it can't (no title yet).
    useSaveShortcut(() => void save(), !paused && !readOnly);
    // A way out saves what is waiting first and asks only when that save
    // can't go; closing the tab gets the browser's own warning.
    const guard = useLeaveGuard({
        dirty,
        lost: fields.title.trim()
            ? "Your latest changes to this post couldn't be saved, and will be lost if you leave now."
            : "A post saves once it has a title, so what you've written will be lost.",
        flush: async () => (await save({ silent: true })) !== null,
    });

    function set<K extends keyof PostFields>(key: K) {
        return (value: PostFields[K]) => {
            setFields((f) => ({ ...f, [key]: value }));
            setDirty(true);
            setSaveFailed(false);
        };
    }

    /** Publish now; true once it is live (Publish post's Tell people). */
    async function publish(): Promise<boolean> {
        setPublishing(true);
        // Publish what is on screen, not what was last saved.
        const id =
            dirty || !postId
                ? await runAction(() => save({ silent: true }))
                : postId;
        if (!id) {
            setPublishing(false);
            return false;
        }
        const res = await runAction(() => publishPost(siteId, id), {
            setBusy: setPublishing,
        });
        if (!res) return false;
        if (!res.ok) {
            // At the plan's blog-posts limit (U13): its notice, not a toast.
            if (res.plan) showPlanRefusal(res.plan);
            else showError(res.error);
            return false;
        }
        setLive(true);
        setLiveAt(new Date().toISOString());
        showSuccess(`Published. It is live at ${res.data.path}.`);
        refreshServer();
        return true;
    }

    async function unpublish() {
        if (!postId) return;
        const res = await runAction(() => unpublishPost(siteId, postId), {
            setBusy: setPublishing,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setLive(false);
        setLiveAt(null);
        showSuccess("Taken off the site. The writing is still here.");
        refreshServer();
    }

    async function remove(): Promise<{ ok: false; error: string } | undefined> {
        if (!postId) return;
        const res = await deletePost(siteId, postId);
        if (!res.ok) return { ok: false, error: res.error };
        guard.release();
        showSuccess("Post deleted.");
        router.push(listHref);
    }

    return {
        postId,
        fields,
        set,
        live,
        liveAt,
        dirty,
        saving,
        publishing,
        savedAt,
        saveFailed,
        save,
        publish,
        unpublish,
        remove,
        guard,
        refresh: () => router.refresh(),
    };
}

export type PostDraft = ReturnType<typeof usePostDraft>;
