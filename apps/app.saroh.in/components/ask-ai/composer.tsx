"use client";

import { ASK_AI_QUESTION_MAX } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import type { Ref } from "react";

import { countWords } from "@/lib/ask-ai/images";
import { AddImages, AttachStrip, BoxLineView } from "./attach";
import type { Attachments } from "./use-attachments";

/**
 * The question box, with Ask, or Stop while an answer arrives. With
 * `attach` (owner, 22 Nov) it also takes images: Add images at its foot,
 * thumbnails above the words, the count, and the one line for a problem.
 */
export function Composer({
    boxRef,
    value,
    onChange,
    onSend,
    onStop,
    running,
    paused,
    placeholder,
    attach,
    phone = false,
}: {
    boxRef?: Ref<HTMLTextAreaElement>;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    running: boolean;
    paused: boolean;
    placeholder: string;
    attach?: Attachments;
    phone?: boolean;
}) {
    const images = attach?.items ?? [];
    const counted = countWords(images);
    // Ask waits until every image is in; words alone, or images alone, may go.
    const ready = !attach || attach.settled;
    const hasWords = !!value.trim() || images.length > 0;
    return (
        <div
            className={cn(
                "relative flex min-h-[78px] flex-col rounded-[14px] border border-border-strong bg-field py-1.5 pl-3.5 pr-1.5 focus-within:ring-2 focus-within:ring-ring",
                paused && "border-border bg-muted",
            )}
        >
            {attach ? (
                <>
                    <AttachStrip items={images} onRemove={attach.remove} />
                    <BoxLineView
                        line={attach.line}
                        onRetry={attach.retry}
                        onRemove={attach.remove}
                    />
                </>
            ) : null}
            <Textarea
                ref={boxRef}
                data-ask-ai-box=""
                aria-label="Ask a question or say what to do"
                rows={1}
                value={value}
                maxLength={ASK_AI_QUESTION_MAX}
                disabled={paused}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onPaste={(e) => {
                    // A copied image is added; copied words paste as they do.
                    const files = Array.from(e.clipboardData.files).filter(
                        (f) => f.type.startsWith("image/"),
                    );
                    if (attach && files.length) {
                        e.preventDefault();
                        attach.addFiles(files);
                    }
                }}
                onKeyDown={(e) => {
                    if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                    ) {
                        e.preventDefault();
                        if (!running && ready && hasWords) onSend();
                    }
                }}
                className="max-h-40 min-h-[44px] w-full resize-none rounded-none border-none bg-transparent px-0 py-2.5 pr-2 text-[14.5px] leading-[1.4] ring-0 [field-sizing:content] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-transparent"
            />
            <div className="flex items-center gap-1.5">
                <div className="-ml-2 flex min-w-0 flex-1 items-center gap-1.5">
                    {attach ? (
                        <AddImages
                            full={attach.full}
                            disabled={paused}
                            phone={phone}
                            onFiles={attach.addFiles}
                            onLibrary={attach.addLibrary}
                        />
                    ) : null}
                    {counted ? (
                        <span
                            data-ph-unmask=""
                            className="text-[12.5px] tabular-nums text-muted-foreground"
                        >
                            {counted}
                        </span>
                    ) : null}
                </div>
                {running ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onStop}
                        aria-label="Stop the answer"
                        className="h-11 shrink-0 rounded-[11px] border-[1.5px] border-foreground px-3.5"
                    >
                        <Square className="size-4 fill-current" aria-hidden />
                        Stop
                    </Button>
                ) : (
                    <IconButton
                        label="Ask"
                        icon={<ArrowUp />}
                        variant="default"
                        tooltip={false}
                        onClick={onSend}
                        disabled={paused || !hasWords || !ready}
                        className="size-11 shrink-0 rounded-[11px] [&_svg]:size-[18px]"
                    />
                )}
            </div>
        </div>
    );
}
