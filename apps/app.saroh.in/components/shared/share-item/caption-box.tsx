"use client";

import { Button } from "@saroh/ui/button";
import { Chip } from "@saroh/ui/chip";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showUndo } from "@saroh/ui/toast";
import { Link2 } from "lucide-react";
import { useId } from "react";

import { shownLink } from "@/lib/share-item/share";
import type { CaptionKind } from "@/lib/share-item/words";
import {
    CAPTION_NAMES,
    captionFits,
    changedTo,
    SHARE_WORDS,
} from "@/lib/share-item/words";

/**
 * The caption (boards BCaption*): Short, With price or Hinglish to start
 * from, then the merchant's own words, with the link as a fixed chip at
 * the end. The words are never the link: it is added as the caption is
 * shared. Switching the start over typed words can be undone.
 */
export function CaptionBox({
    kinds,
    kind,
    onKind,
    text,
    onText,
    link,
    onDone,
    phone = false,
    className,
}: {
    kinds: readonly CaptionKind[];
    /** The chip it started from. */
    kind: CaptionKind | null;
    onKind: (kind: CaptionKind) => void;
    text: string;
    onText: (text: string) => void;
    /** The link the caption ends with. */
    link: string;
    /** Done closes the editor; without it, none. */
    onDone?: () => void;
    phone?: boolean;
    className?: string;
}) {
    const id = useId();
    const pick = (k: CaptionKind) => {
        if (k === kind) return;
        const before = { text, kind };
        onKind(k);
        showUndo(changedTo(k), () => {
            if (before.kind) onKind(before.kind);
            onText(before.text);
        });
    };
    return (
        <section
            aria-labelledby={`${id}-label`}
            data-caption-editor=""
            className={cn("grid gap-3", className)}
        >
            <div className="flex items-center justify-between gap-3">
                <h3
                    id={`${id}-label`}
                    className={cn(
                        "font-semibold",
                        phone ? "text-[17px]" : "text-[14.5px]",
                    )}
                >
                    {SHARE_WORDS.caption}
                </h3>
                {onDone ? (
                    <Button type="button" onClick={onDone} data-caption-done="">
                        {SHARE_WORDS.captionDone}
                    </Button>
                ) : null}
            </div>
            <div
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                className="flex flex-wrap gap-1.5"
            >
                {kinds.map((k) => (
                    <Chip key={k} on={kind === k} onClick={() => pick(k)}>
                        {CAPTION_NAMES[k]}
                    </Chip>
                ))}
            </div>
            <div className="rounded-[10px] border border-input bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                <Textarea
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-note`}
                    value={text}
                    onChange={(e) => onText(e.target.value)}
                    rows={3}
                    className="min-h-[72px] resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.5] shadow-none focus-visible:ring-0"
                />
                <span
                    title={link}
                    data-caption-link=""
                    className="mt-2 inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 text-[12.5px] text-muted-foreground"
                >
                    <Link2 aria-hidden className="size-3.5 shrink-0" />
                    <span className="truncate">{shownLink(link)}</span>
                </span>
            </div>
            <p
                id={`${id}-note`}
                className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground"
            >
                {captionFits(Array.from(text.trim()).length)}{" "}
                {SHARE_WORDS.linkBecomes}
            </p>
        </section>
    );
}
