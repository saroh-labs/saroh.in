"use client";

import { ASK_AI_QUESTION_MAX } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import type { Ref } from "react";

/** The question box, with Ask, or Stop while an answer arrives. */
export function Composer({
    boxRef,
    value,
    onChange,
    onSend,
    onStop,
    running,
    paused,
    placeholder,
}: {
    boxRef?: Ref<HTMLTextAreaElement>;
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    running: boolean;
    paused: boolean;
    placeholder: string;
}) {
    return (
        <div
            className={cn(
                "flex min-h-[78px] items-end gap-2 rounded-[14px] border border-border-strong bg-field py-1.5 pl-3.5 pr-1.5 focus-within:ring-2 focus-within:ring-ring",
                paused && "border-border bg-muted",
            )}
        >
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
                onKeyDown={(e) => {
                    if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                    ) {
                        e.preventDefault();
                        if (!running) onSend();
                    }
                }}
                className="max-h-40 min-h-[44px] flex-1 resize-none self-stretch rounded-none border-none bg-transparent px-0 py-2.5 text-[14.5px] leading-[1.4] ring-0 [field-sizing:content] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:bg-transparent"
            />
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
                    disabled={paused || !value.trim()}
                    className="size-11 shrink-0 rounded-[11px] [&_svg]:size-[18px]"
                />
            )}
        </div>
    );
}
