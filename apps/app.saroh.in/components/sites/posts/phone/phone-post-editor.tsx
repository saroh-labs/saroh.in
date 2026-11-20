"use client";

import { Button } from "@saroh/ui/button";
import type { Editor } from "@tiptap/react";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";

import { openAskAi } from "@/components/ask-ai/open";
import { EditorSheet } from "@/components/sites/editor/editor-sheet";

import type { PostEditorModel } from "../editor/post-model";
import { PostBanner } from "../editor/post-states";
import {
    POST_HISTORY_READY,
    PostHistoryPanel,
} from "../history/post-history-panel";
import { PostFeedback } from "../post-feedback";
import { DetailsSheet } from "./details-sheet";
import { AddMenu, MoreMenu } from "./phone-menus";
import { PhonePostBar } from "./phone-post-bar";
import { PhoneSurface } from "./phone-surface";
import { useVisibleArea } from "./use-visual-viewport";
import type { ToolPanel } from "./writing-tools";
import { FormatPanel, WritingToolbar } from "./writing-tools";

type PhoneSheet = "add" | "more" | "feedback" | "versions" | null;

/**
 * The post editor on a phone (U16; `blogphone/WXYWrite`, `WXYAdd`,
 * `WXYFormat`, `WXYDetails`, `WXYMore`, `WXYStates`). The same model and
 * draft as the desk (`PostShell` builds both and hands them here), so
 * autosave, ⌘S, Publish, Take off the site and Delete are one code path.
 *
 * The bar; the one line under it (couldn't save, paused, from Ask AI);
 * the post in the site's look; and above the keyboard the writing tools,
 * kept in view as the keyboard rises (`useVisibleArea`). Publish post is
 * `onPublish` (U18's sheet once built), Versions is U17's History.
 */
export function PhonePostEditor({
    model,
    onPublish,
    titleError,
    onDiscard,
}: {
    model: PostEditorModel;
    onPublish: () => void;
    titleError: boolean;
    /** Started from Ask AI and not yet saved: Discard and Save draft. */
    onDiscard?: () => void;
}) {
    const { data, draft } = model;
    const writer = !data.readOnly && !data.paused;
    const area = useVisibleArea();
    const [editor, setEditor] = useState<Editor | null>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);
    const [sheet, setSheet] = useState<PhoneSheet>(null);
    const [details, setDetails] = useState(false);
    const [coverOpen, setCoverOpen] = useState(false);
    const [panel, setPanel] = useState<ToolPanel>(null);
    const [toolbar, setToolbar] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const close = () => setSheet(null);

    const feedback = data.feedback;
    const openNotes =
        feedback?.comments.filter((c) => c.resolvedAt === null).length ?? 0;
    const askAiStart = onDiscard !== undefined;
    const openCover = () => {
        setSheet(null);
        setCoverOpen(true);
        setDetails(true);
    };

    return (
        <div
            data-phone-post-editor=""
            className="fixed inset-x-0 top-0 z-30 flex h-dvh flex-col bg-background"
            style={
                area
                    ? {
                          height: area.height,
                          transform: `translateY(${area.top}px)`,
                      }
                    : undefined
            }
        >
            {previewing ? (
                <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-background px-1.5">
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-11 px-2"
                        onClick={() => setPreviewing(false)}
                    >
                        <ChevronLeft aria-hidden className="size-5" />
                        Back to editing
                    </Button>
                    <span className="min-w-0 flex-1 truncate text-right text-[0.8125rem] text-muted-foreground">
                        As a reader sees it
                    </span>
                </header>
            ) : (
                <PhonePostBar
                    model={model}
                    onDetails={() => setDetails(true)}
                    onMore={() => setSheet("more")}
                    onPublish={onPublish}
                    openNotes={openNotes}
                    askAiStart={askAiStart}
                />
            )}
            <PostBanner model={model} />
            <div ref={setHost} className="relative min-h-0 flex-1">
                <main
                    aria-label="Post"
                    className="h-full overflow-y-auto bg-background"
                >
                    <PhoneSurface
                        model={model}
                        previewing={previewing}
                        titleError={titleError}
                        toolbar={toolbar}
                        onToolbar={setToolbar}
                        onEditor={setEditor}
                        onCover={openCover}
                    />
                </main>
            </div>
            {askAiStart && !previewing ? (
                <div className="flex shrink-0 gap-2 border-t bg-background px-4 py-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11 flex-1"
                        onClick={onDiscard}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        className="h-11 flex-1"
                        busy={draft.saving}
                        busyLabel="Saving…"
                        onClick={() => {
                            if (!model.needsTitle()) void draft.save();
                        }}
                    >
                        Save draft
                    </Button>
                </div>
            ) : writer && !previewing ? (
                <>
                    <WritingToolbar
                        editor={editor}
                        panel={panel}
                        onPanel={setPanel}
                        onAdd={() => {
                            setPanel(null);
                            setSheet("add");
                        }}
                        askAi={data.askAi ? openAskAi : null}
                        keyboardUp={area?.keyboardUp ?? false}
                    />
                    {panel === "format" && editor ? (
                        <FormatPanel
                            editor={editor}
                            onMoreFormatting={() => {
                                setPanel(null);
                                setToolbar(true);
                            }}
                        />
                    ) : null}
                </>
            ) : null}

            <EditorSheet
                open={sheet === "add"}
                onClose={close}
                container={host}
                side="bottom"
                title="Add to the post"
                closeLabel="Close Add"
            >
                <AddMenu editor={editor} onDone={close} />
            </EditorSheet>
            <EditorSheet
                open={sheet === "more"}
                onClose={close}
                container={host}
                side="bottom"
                title="This post"
                closeLabel="Close More"
            >
                <MoreMenu
                    model={model}
                    openNotes={openNotes}
                    onPreview={() => {
                        close();
                        setPanel(null);
                        setPreviewing(true);
                    }}
                    onCover={writer ? openCover : null}
                    onFeedback={
                        feedback && draft.postId
                            ? () => setSheet("feedback")
                            : null
                    }
                    onVersions={
                        POST_HISTORY_READY && writer && draft.postId
                            ? () => setSheet("versions")
                            : null
                    }
                />
            </EditorSheet>
            {feedback && draft.postId ? (
                <EditorSheet
                    open={sheet === "feedback"}
                    onClose={close}
                    container={host}
                    side="bottom"
                    title="Feedback"
                    closeLabel="Close Feedback"
                    className="h-[80%]"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                        <PostFeedback
                            siteId={data.siteId}
                            postId={draft.postId}
                            title={draft.fields.title}
                            {...feedback}
                            onChanged={draft.refresh}
                        />
                    </div>
                </EditorSheet>
            ) : null}
            {POST_HISTORY_READY ? (
                <EditorSheet
                    open={sheet === "versions"}
                    onClose={close}
                    container={host}
                    side="bottom"
                    title="Versions"
                    closeLabel="Close Versions"
                    className="h-[80%]"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <PostHistoryPanel model={model} />
                    </div>
                </EditorSheet>
            ) : null}
            <DetailsSheet
                model={model}
                open={details}
                onClose={() => {
                    setDetails(false);
                    setCoverOpen(false);
                }}
                coverOpen={coverOpen}
                onCoverOpen={setCoverOpen}
            />
        </div>
    );
}
