"use client";

import type { Editor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";

import { AskAiPageIs } from "@/components/ask-ai/ask-ai-page";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { useEditorLayout } from "@/components/sites/editor/use-editor-layout";
import { postPage } from "@/lib/ask-ai/page-hints";
import type { PostDetail } from "@/lib/content/service";
import { formatDateTime } from "@/lib/format/datetime";
import { postChanges, postStatusLabel } from "@/lib/sites/post-diff";

import { PhonePostEditor } from "../phone/phone-post-editor";
import { usePublishPost } from "../publish/publish-post";
import { approvalStatus } from "../review/approval-words";
import { PostFrame, usePostFrame } from "./post-frame";
import type { PostEditorData, PostEditorModel } from "./post-model";
import { usePostDraft } from "./use-post-draft";
import { WritingSurface } from "./writing-surface";

export { postTrailTabs } from "./post-trail";
export type { PostTrailKey } from "./post-trail";

/**
 * The post editor at desk (U15; `blogdesk/WXWWrite`, `WXWInsert`,
 * `WXWSearch`, `WXWStates`), in the editor shell's pieces (the rail, the
 * inspector frame): the bar, the rail | the left panel | the writing
 * surface | the inspector. 64 | 280 | page | 360 at 1920; 292 and 340
 * at 1440 (`fix/WXEEditor`); at 1200 and below the left panel folds away.
 *
 * Every write is today's (`usePostDraft`): autosave, ⌘S, Publish, Take off
 * the site, Delete. Publish post is `usePublishPost` (U18 fills its sheet)
 * and History is `PostHistoryPanel` (U17). The bar, rail, list and right
 * column are `PostFrame`'s, which stays mounted from post to post.
 */
export function PostShell(props: {
    data: PostEditorData;
    /** Absent when writing a new post. */
    post?: PostDetail;
}) {
    // In `write/layout.tsx` the frame is already drawn and stays; alone (a
    // test, a page without the layout) the post draws its own.
    return usePostFrame() ? (
        <PostBody {...props} />
    ) : (
        <PostFrame>
            <PostBody {...props} />
        </PostFrame>
    );
}

/**
 * One post: its draft and the writing surface. Everything else the frame
 * draws from what this hands it (`PostLive`), after every render.
 */
function PostBody({ data, post }: { data: PostEditorData; post?: PostDetail }) {
    const frame = usePostFrame();
    if (!frame) throw new Error("PostBody is drawn inside PostFrame");
    const { previewing, toolbar, setToolbar, openCover, show } = frame;
    const router = useRouter();
    const zone = useBusinessZone();
    // Below 760px the phone post editor (U16), on this same model and draft.
    const phone = useEditorLayout() === "phone";
    const { siteId } = data;
    const addressOf = useCallback(
        (id: string) => `/sites/${siteId}/write/${id}`,
        [siteId],
    );
    const draft = usePostDraft({
        siteId,
        post,
        fromAskAi: data.fromAskAi,
        paused: data.paused,
        readOnly: data.readOnly,
        addressOf,
        listHref: `/sites/${siteId}/writing`,
    });
    const [editor, setEditor] = useState<Editor | null>(null);
    const [titleError, setTitleError] = useState(false);

    // Preview reads the post as it will show: nothing on it edits. No
    // update emitted: Tiptap's default made opening a post count as an edit.
    useEffect(() => {
        if (editor && !editor.isDestroyed)
            editor.setEditable(!previewing, false);
    }, [editor, previewing]);
    // The title asked for is given: the error goes.
    const showTitleError = titleError && !draft.fields.title.trim();

    const liveCopy = post?.liveCopy ?? null;
    const category =
        data.categories.find((c) => c.id === draft.fields.categoryId)?.name ??
        "";
    const waiting = useMemo(
        () =>
            draft.live
                ? postChanges({ ...draft.fields, category }, liveCopy).length
                : 0,
        [draft.live, draft.fields, category, liveCopy],
    );
    const scheduledAt = post?.scheduledAt ?? null;
    const approval = post?.approval ?? null;
    const model: PostEditorModel = {
        data,
        draft,
        liveCopy,
        scheduledAt,
        approval,
        waiting,
        // "Waiting for Kavya's approval" while approval stands in the way (O7).
        status:
            approvalStatus(approval) ??
            postStatusLabel({
                live: draft.live,
                waiting,
                scheduledFor:
                    scheduledAt && !draft.live
                        ? formatDateTime(scheduledAt, zone)
                        : null,
            }),
        needsTitle: () => {
            if (draft.fields.title.trim()) return false;
            setTitleError(true);
            return true;
        },
    };
    const publish = usePublishPost(model);

    const onDiscard =
        data.fromAskAi !== undefined && !draft.postId
            ? () => {
                  draft.guard.release();
                  router.push(`/sites/${siteId}/writing`);
              }
            : undefined;

    // The frame's bar, list and inspector read this post after each render;
    // gone, they show their skeletons until the next post is here.
    const key = post?.id ?? "new";
    useLayoutEffect(() => {
        show({ key, model, editor, onPublish: publish.open, onDiscard });
    });
    useLayoutEffect(() => () => show(null), [show]);

    // Every Ask AI here is about this post (owner, 21 Nov).
    const askAiHere =
        data.askAi && !data.readOnly ? (
            <AskAiPageIs
                page={postPage({
                    siteId,
                    postId: draft.postId ?? null,
                    title: draft.fields.title,
                })}
            />
        ) : null;

    return (
        <>
            {askAiHere}
            {phone ? (
                <PhonePostEditor
                    model={model}
                    onPublish={publish.open}
                    titleError={showTitleError}
                    onDiscard={onDiscard}
                />
            ) : (
                <WritingSurface
                    model={model}
                    previewing={previewing}
                    titleError={showTitleError}
                    toolbar={toolbar}
                    onToolbar={setToolbar}
                    onEditor={setEditor}
                    onCover={openCover}
                />
            )}
            {publish.node}
            {draft.guard.dialog}
        </>
    );
}
