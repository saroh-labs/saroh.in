"use client";

import { TabStrip } from "@saroh/ui/tabs";
import { Check, FileText } from "lucide-react";

import { InspectorFrame } from "@/components/sites/editor/shell/inspector-frame";

import { PostFeedback } from "../post-feedback";
import type { DetailsRow } from "./details-tab";
import { DetailsTab } from "./details-tab";
import type { PostEditorModel } from "./post-model";
import { SearchTab } from "./search-tab";

export type InspectorTab = "details" | "search" | "feedback";

/**
 * The right column for a post (`blogdesk/WXWWrite`, `WXWSearch`): "Post ·
 * Shows in Blog", then Details · Search and sharing · Feedback n, and the
 * one save line (RULES §2, C1). In the shell's `InspectorFrame`.
 */
export function PostInspector({
    model,
    tab,
    onTab,
    editing,
    onEditing,
}: {
    model: PostEditorModel;
    tab: InspectorTab;
    onTab: (tab: InspectorTab) => void;
    editing: DetailsRow;
    onEditing: (row: DetailsRow) => void;
}) {
    const { data, draft } = model;
    const feedback = data.feedback;
    const openNotes =
        feedback?.comments.filter((c) => c.resolvedAt === null).length ?? 0;
    const tabs = [
        { value: "details" as const, label: "Details" },
        { value: "search" as const, label: "Search and sharing" },
        ...(feedback && draft.postId
            ? [
                  {
                      value: "feedback" as const,
                      label: "Feedback",
                      count: openNotes || undefined,
                  },
              ]
            : []),
    ];
    return (
        <InspectorFrame
            header={
                <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
                    <FileText
                        aria-hidden
                        className="size-4 text-muted-foreground"
                    />
                    <h2 className="text-[0.9375rem] font-semibold">Post</h2>
                    <span className="truncate text-[0.8125rem] text-muted-foreground">
                        Shows in Blog
                    </span>
                </div>
            }
            tabs={
                <TabStrip
                    label="Post"
                    idPrefix="post-inspector"
                    tabs={tabs}
                    value={tab}
                    onValueChange={onTab}
                    // The board's tighter tabs (`blogdesk/WXWWrite`): all three
                    // fit a 340px inspector, Feedback included.
                    listClassName="px-2 [&>button]:px-2 [&>button]:text-[13px]"
                />
            }
        >
            <div className="flex min-h-0 flex-col">
                <div
                    role="tabpanel"
                    aria-labelledby={`post-inspector-${tab}`}
                    className="min-h-0 flex-1 overflow-y-auto p-4"
                >
                    {tab === "feedback" && feedback && draft.postId ? (
                        <PostFeedback
                            siteId={data.siteId}
                            postId={draft.postId}
                            title={draft.fields.title}
                            {...feedback}
                            onChanged={draft.refresh}
                        />
                    ) : tab === "search" ? (
                        <SearchTab
                            model={model}
                            onReplaceCover={() => {
                                onTab("details");
                                onEditing("cover");
                            }}
                        />
                    ) : (
                        <DetailsTab
                            model={model}
                            editing={editing}
                            onEditing={onEditing}
                        />
                    )}
                </div>
                {data.readOnly ? null : (
                    <p className="flex shrink-0 items-center gap-1.5 border-t px-4 py-3 text-[0.8125rem] text-foreground/75">
                        {draft.dirty || draft.saveFailed ? (
                            "Goes live when you publish"
                        ) : (
                            <>
                                <Check
                                    aria-hidden
                                    className="size-3.5 text-success"
                                />
                                Saved · goes live when you publish
                            </>
                        )}
                    </p>
                )}
            </div>
        </InspectorFrame>
    );
}
