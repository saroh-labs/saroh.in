"use client";

import { Button } from "@saroh/ui/button";

/**
 * The bar over words being typed on the canvas (U47d, `fix/WXKText`):
 * what the words are, how long they are against the field's limit, and
 * Done. Rewrite waits for Ask AI on the canvas (U50).
 */
export function TypingBar({
    field,
    text,
    done,
    max,
}: {
    field: string;
    text: string;
    done: () => void;
    /** The field's limit in the contract, when it has one. */
    max?: number;
}) {
    const length = text.trim().length;
    return (
        // In the section toolbar's place while typing (D1): the same card.
        <span
            role="toolbar"
            aria-label="Typing"
            data-typing-bar=""
            className="inline-flex items-center gap-2 rounded-[11px] border bg-card py-1 pl-3 pr-1 font-sans text-xs text-foreground shadow-[0_2px_4px_hsl(var(--shadow-color)/0.06),0_8px_22px_hsl(var(--shadow-color)/0.12)]"
        >
            <span className="font-medium">
                {field === "heading" ? "Heading" : "Paragraph"}
            </span>
            {max !== undefined ? (
                // The length against the limit as a 100px meter (D1).
                <span
                    aria-hidden
                    className="block h-1 w-[100px] overflow-hidden rounded-full bg-muted"
                >
                    <span
                        className={`block h-full rounded-full ${length > max ? "bg-destructive" : "bg-foreground"}`}
                        style={{
                            width: `${Math.min(100, (length / max) * 100)}%`,
                        }}
                    />
                </span>
            ) : null}
            <span
                className={
                    max !== undefined && length > max
                        ? "text-destructive"
                        : "text-muted-foreground"
                }
            >
                {max === undefined
                    ? `${length} characters`
                    : `${length} of ${max}`}
            </span>
            <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={done}
            >
                Done
            </Button>
        </span>
    );
}
