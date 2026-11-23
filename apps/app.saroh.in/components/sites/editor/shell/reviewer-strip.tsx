"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Switch } from "@saroh/ui/switch";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { formatDate } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

import { nextChange, unitSectionKey } from "../use-editor-review";
import type { EditorModel } from "./editor-model";
import { LiveVersionPage } from "./live-version";

/**
 * A reader's strip under the bar (`fix/WXMReviewer`): who asked and when,
 * what is waiting for Publish ("Changed since live · 7 changes", the same
 * change units Publish counts), Next change, and how much of the site they
 * have read, and Live version (R1), which shows what visitors see now
 * over the canvas. Drawn while a review was asked for or something is
 * waiting.
 */
export function ReviewerStrip({ model }: { model: EditorModel }) {
    const zone = useBusinessZone();
    const { review, changes } = model.review;
    const request = review.pending ? review.request : null;
    const waiting = changes ?? [];
    const [showLive, setShowLive] = useState(false);
    if (!request && waiting.length === 0) return null;
    const read = review.pagesRead;
    const next = nextChange(waiting, {
        pageId: model.pageId,
        sectionKey: model.active?.section.key ?? null,
    });
    return (
        <div
            role="region"
            aria-label="Review request"
            className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-card px-4 py-2 text-sm"
        >
            {request ? (
                <span className="min-w-0 truncate">
                    <b className="font-semibold">
                        {`${request.by} asked you to review`}
                    </b>
                    {` · ${formatDate(request.at, zone)}`}
                </span>
            ) : null}
            {waiting.length > 0 ? (
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-semibold coarse:min-h-11"
                            data-reader-changes=""
                        >
                            {`Changed since live · ${count(waiting.length, "change")}`}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        className="max-h-80 w-80 overflow-y-auto p-0"
                    >
                        <ul className="divide-y text-sm">
                            {waiting.map((unit) => (
                                <li key={unit.key} className="px-3 py-2">
                                    {/* R1: what was taken out reads struck through. */}
                                    <span
                                        className={
                                            unit.change === "removed"
                                                ? "block font-medium text-muted-foreground line-through"
                                                : "block font-medium"
                                        }
                                    >
                                        {unit.label}
                                    </span>
                                    <span className="block text-xs text-muted-foreground">
                                        {unit.where}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </PopoverContent>
                </Popover>
            ) : null}
            <span className="flex-1" />
            {waiting.length > 0 ? (
                // R1: flip the canvas between the draft and the live page.
                <span className="flex shrink-0 items-center gap-2">
                    <Switch
                        id="reviewer-live-version"
                        checked={showLive}
                        onCheckedChange={setShowLive}
                    />
                    <Label
                        htmlFor="reviewer-live-version"
                        className="text-[0.8125rem] font-normal"
                    >
                        Live version
                    </Label>
                    {showLive ? <LiveVersionPage model={model} /> : null}
                </span>
            ) : null}
            {read && read.total > 0 ? (
                // Last on a phone, on its own line under the changes.
                <span className="order-last flex w-full shrink-0 items-center gap-2 text-[0.8125rem] text-muted-foreground sm:order-none sm:w-auto">
                    {`Read ${read.read} of ${read.total} pages`}
                    <span
                        aria-hidden
                        className="relative h-1.5 w-20 overflow-hidden rounded-full bg-secondary"
                    >
                        <i
                            className="absolute inset-y-0 left-0 bg-foreground"
                            style={{
                                width: `${Math.round((100 * read.read) / read.total)}%`,
                            }}
                        />
                    </span>
                </span>
            ) : null}
            {next ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 coarse:min-h-11"
                    onClick={() => {
                        const key = unitSectionKey(next) ?? "";
                        model.jumpToNote(next.pageId ?? model.pageId, key);
                        if (next.pageId === model.pageId) {
                            const index = model.draft.sections.findIndex(
                                (s) => s.key === key,
                            );
                            if (index !== -1) model.scrollToSection(index);
                        }
                    }}
                >
                    Next change
                </Button>
            ) : null}
        </div>
    );
}
