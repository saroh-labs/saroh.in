"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, Pencil } from "lucide-react";

import type { AskAiSuggestion } from "@/lib/ask-ai/page-hints";

/**
 * The page's suggestions with their hints (AF 1, 2, 5): a question asks
 * at once (and doesn't use a question); a pencil one, dashed, only puts
 * its words in the box.
 */
export function Suggestions({
    suggestions,
    disabled,
    onAsk,
    onFill,
}: {
    suggestions: AskAiSuggestion[];
    disabled: boolean;
    onAsk: (question: string) => void;
    onFill: (words: string) => void;
}) {
    return (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {suggestions.map((s) => (
                <li key={s.label}>
                    <button
                        type="button"
                        disabled={disabled && !s.fill}
                        onClick={() =>
                            s.fill ? onFill(s.question) : onAsk(s.question)
                        }
                        className={cn(
                            "flex min-h-[68px] w-full items-center gap-2.5 rounded-xl border border-border bg-card py-2 pl-3.5 pr-3 text-left text-sm hover:border-border-strong hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground dark:hover:bg-muted",
                            s.fill && "border-dashed border-border-strong",
                        )}
                    >
                        {s.fill ? (
                            <Pencil
                                className="size-3.5 shrink-0 text-neutral-700 dark:text-foreground"
                                aria-hidden
                            />
                        ) : null}
                        <span className="min-w-0 flex-1 leading-[1.45]">
                            {s.label}
                        </span>
                        {s.hint ? (
                            <span className="h-6 max-w-[48%] truncate whitespace-nowrap rounded-full bg-ask-subtle px-[9px] text-xs font-semibold leading-6 text-ask-subtle-foreground">
                                {s.hint}
                            </span>
                        ) : null}
                        <ChevronRight
                            className="size-3.5 shrink-0 text-neutral-700 dark:text-foreground"
                            aria-hidden
                        />
                    </button>
                </li>
            ))}
        </ul>
    );
}
