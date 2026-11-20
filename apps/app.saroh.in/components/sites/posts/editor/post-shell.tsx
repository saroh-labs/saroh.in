"use client";

import type { Editor } from "@tiptap/react";
import { FileText, History, MessageSquare, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { openAskAi } from "@/components/ask-ai/open";
import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { TrailTab } from "@/components/sites/editor/shell/editor-trail";
import { EditorTrail } from "@/components/sites/editor/shell/editor-trail";
import { useEditorLayout } from "@/components/sites/editor/use-editor-layout";
import { AddList } from "@/components/sites/rich-text/writing-menus";
import type { PostDetail } from "@/lib/content/service";
import { formatDateTime } from "@/lib/format/datetime";
import { postChanges, postStatusLabel } from "@/lib/sites/post-diff";

import {
    POST_HISTORY_READY,
    PostHistoryPanel,
} from "../history/post-history-panel";
import { PhonePostEditor } from "../phone/phone-post-editor";
import { usePublishPost } from "../publish/publish-post";
import { ApprovalBand } from "../review/approval-band";
import { approvalStatus } from "../review/approval-words";
import type { DetailsRow } from "./details-tab";
import type { InspectorTab } from "./post-inspector";
import { PostInspector } from "./post-inspector";
import type { PostEditorData, PostEditorModel } from "./post-model";
import { PostMoreMenu } from "./post-more-menu";
import { PostBanner } from "./post-states";
import { PostTopBar } from "./post-top-bar";
import { PostsLeftPanel } from "./posts-left-panel";
import { usePostDraft } from "./use-post-draft";
import { WritingSurface } from "./writing-surface";

export type PostTrailKey = "posts" | "add" | "ask" | "history" | "feedback";

/**
 * The post editor's rail (`blogdesk/WXWWrite`, C3): Posts · Add · Ask AI ·
 * History · Feedback; a reader's Posts · Feedback. Ask AI shows where it
 * is on; History once U17 builds it.
 */
export function postTrailTabs({
    readOnly,
    askAi,
    history,
    openNotes,
    feedback,
}: {
    readOnly: boolean;
    askAi: boolean;
    history: boolean;
    openNotes: number;
    feedback: boolean;
}): TrailTab<PostTrailKey>[] {
    const tabs: (TrailTab<PostTrailKey> | false)[] = [
        { key: "posts", label: "Posts", icon: FileText },
        !readOnly && { key: "add", label: "Add", icon: Plus },
        !readOnly && askAi && { key: "ask", label: "Ask AI", icon: Sparkles },
        !readOnly &&
            history && {
                key: "history",
                label: "History",
                icon: History,
            },
        feedback && {
            key: "feedback",
            label: "Feedback",
            icon: MessageSquare,
            count: openNotes,
        },
    ];
    return tabs.filter((t): t is TrailTab<PostTrailKey> => t !== false);
}

/**
 * The post editor at desk (U15; `blogdesk/WXWWrite`, `WXWInsert`,
 * `WXWSearch`, `WXWStates`), in the editor shell's pieces (the rail, the
 * inspector frame): the bar, the rail | the left panel | the writing
 * surface | the inspector. 64 | 280 | page | 360 at 1920; 292 and 340
 * at 1440 (`fix/WXEEditor`); at 1200 and below the left panel folds away.
 *
 * Every write is today's (`usePostDraft`): autosave, ⌘S, Publish, Take off
 * the site, Delete. Publish post is `usePublishPost` (U18 fills its sheet)
 * and History is `PostHistoryPanel` (U17).
 */
export function PostShell({
    data,
    post,
}: {
    data: PostEditorData;
    /** Absent when writing a new post. */
    post?: PostDetail;
}) {
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
    const [trail, setTrail] = useState<PostTrailKey>(
        data.readOnly && data.feedback ? "feedback" : "posts",
    );
    const [tab, setTab] = useState<InspectorTab>(
        data.readOnly && data.feedback && post ? "feedback" : "details",
    );
    const [editing, setEditing] = useState<DetailsRow>(null);
    const [toolbar, setToolbar] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [titleError, setTitleError] = useState(false);

    // Preview reads the post as it will show: nothing on it edits.
    useEffect(() => {
        if (editor && !editor.isDestroyed) editor.setEditable(!previewing);
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

    const feedback = data.feedback;
    const openNotes =
        feedback?.comments.filter((c) => c.resolvedAt === null).length ?? 0;
    const tabs = postTrailTabs({
        readOnly: data.readOnly || data.paused,
        askAi: data.askAi,
        history: POST_HISTORY_READY,
        openNotes,
        feedback: Boolean(feedback && draft.postId),
    });

    function onTrail(key: PostTrailKey) {
        if (key === "ask") {
            // The global panel until Ask AI docks in the editor (U50).
            openAskAi();
            return;
        }
        if (key === "feedback") setTab("feedback");
        setTrail(key);
    }

    const openCover = () => {
        setTab("details");
        setEditing("cover");
    };

    const onDiscard =
        data.fromAskAi !== undefined && !draft.postId
            ? () => {
                  draft.guard.release();
                  router.push(`/sites/${siteId}/writing`);
              }
            : undefined;

    if (phone) {
        return (
            <>
                <PhonePostEditor
                    model={model}
                    onPublish={publish.open}
                    titleError={showTitleError}
                    onDiscard={onDiscard}
                />
                {publish.node}
                {draft.guard.dialog}
            </>
        );
    }

    const left =
        trail === "add" ? (
            <section aria-label="Add" className="flex min-h-0 flex-1 flex-col">
                <h2 className="flex h-12 shrink-0 items-center px-4 text-[0.9375rem] font-semibold">
                    Add to the post
                </h2>
                <p className="px-4 pb-1 text-[0.8125rem] text-muted-foreground">
                    Adds where the cursor is. Or type / on an empty line.
                </p>
                <AddList editor={editor} />
            </section>
        ) : trail === "history" && POST_HISTORY_READY ? (
            <PostHistoryPanel model={model} />
        ) : (
            <PostsLeftPanel model={model} />
        );

    return (
        <div className="flex h-dvh flex-col bg-background">
            <PostTopBar
                model={model}
                editor={editor}
                previewing={previewing}
                onPreview={setPreviewing}
                onPublish={publish.open}
                more={
                    <PostMoreMenu
                        model={model}
                        onMoreFormatting={() => setToolbar(true)}
                    />
                }
                onDiscard={onDiscard}
            />
            <PostBanner model={model} />
            <ApprovalBand model={model} />
            <div className="flex min-h-0 flex-1">
                {previewing ? null : (
                    <>
                        <EditorTrail
                            tabs={tabs}
                            value={trail}
                            onSelect={onTrail}
                        />
                        <div
                            data-left-panel={trail}
                            className="flex w-[292px] shrink-0 flex-col border-r bg-card max-[1200px]:hidden min-[1600px]:w-[280px]"
                        >
                            {left}
                        </div>
                    </>
                )}
                <main aria-label="Post" className="grid min-h-0 min-w-0 flex-1">
                    <WritingSurface
                        model={model}
                        previewing={previewing}
                        titleError={showTitleError}
                        toolbar={toolbar}
                        onToolbar={setToolbar}
                        onEditor={setEditor}
                        onCover={openCover}
                    />
                </main>
                {previewing ? null : (
                    <div className="flex w-[340px] shrink-0 border-l min-[1600px]:w-[360px] [&>*]:flex-1">
                        <PostInspector
                            model={model}
                            tab={tab}
                            onTab={(t) => {
                                setTab(t);
                                if (t !== "feedback" && trail === "feedback")
                                    setTrail("posts");
                            }}
                            editing={editing}
                            onEditing={setEditing}
                        />
                    </div>
                )}
            </div>
            {publish.node}
            {draft.guard.dialog}
        </div>
    );
}
