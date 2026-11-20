"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { RotateCw } from "lucide-react";

import { PausedNote } from "@/components/billing/paused-banner";
import { pausedWords } from "@/lib/billing/paused";

import { ASK_AI_GONE, FROM_ASK_AI } from "../post-editor";
import type { PostEditorModel } from "./post-model";

/** `WXWStates` "Couldn't save": every word stays on screen. */
export const COULDNT_SAVE_TITLE = "Couldn't save your latest changes.";
export const COULDNT_SAVE_BODY =
    "Your writing is still here. Check your connection and try again.";

/**
 * The one line under the bar (`blogdesk/WXWStates`, RULES §4), at most
 * one at a time: couldn't save (Try again), paused (today's words), or
 * started from an Ask AI draft.
 */
export function PostBanner({ model }: { model: PostEditorModel }) {
    const { draft, data } = model;
    if (draft.saveFailed) {
        return (
            <Notice
                tone="error"
                layout="banner"
                title={COULDNT_SAVE_TITLE}
                action={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        busy={draft.saving}
                        busyLabel="Saving…"
                        onClick={() => void draft.save()}
                    >
                        <RotateCw aria-hidden className="size-4" />
                        Try again
                    </Button>
                }
            >
                {COULDNT_SAVE_BODY}
            </Notice>
        );
    }
    if (data.paused) {
        return (
            <PausedNote className="mx-4 mt-3">{pausedWords("post")}</PausedNote>
        );
    }
    if (data.fromAskAi !== undefined && !draft.postId) {
        return (
            <Notice tone="info" layout="banner">
                {data.fromAskAi ? FROM_ASK_AI : ASK_AI_GONE}
            </Notice>
        );
    }
    return null;
}
