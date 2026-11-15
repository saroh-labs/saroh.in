"use client";

import { Chip } from "@saroh/ui/chip";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import type { CaptionKind } from "@/lib/share-item/words";
import { CAPTION_NAMES, SHARE_WORDS } from "@/lib/share-item/words";

/**
 * The caption (SFBDesk, SFBPhone): Short, With price or Hinglish to start
 * from, then the merchant's own words. What is in the box is what is
 * copied and shared.
 */
export function CaptionBox({
    kinds,
    kind,
    onKind,
    text,
    onText,
    showLabel = true,
}: {
    kinds: readonly CaptionKind[];
    /** The chip it started from; null once the words are their own. */
    kind: CaptionKind | null;
    onKind: (kind: CaptionKind) => void;
    text: string;
    onText: (text: string) => void;
    /** The phone draws no "Caption" or link note around it, as its board does. */
    showLabel?: boolean;
}) {
    const id = useId();
    return (
        <div className="grid gap-2">
            <span
                id={`${id}-label`}
                className={showLabel ? "text-[13px] font-semibold" : "sr-only"}
            >
                {SHARE_WORDS.caption}
            </span>
            <div
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                className="flex flex-wrap gap-1.5"
            >
                {kinds.map((k) => (
                    <Chip key={k} on={kind === k} onClick={() => onKind(k)}>
                        {CAPTION_NAMES[k]}
                    </Chip>
                ))}
            </div>
            <Textarea
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-note`}
                value={text}
                onChange={(e) => onText(e.target.value)}
                rows={5}
                className="min-h-[120px] text-[14px] leading-[1.5]"
            />
            <p
                id={`${id}-note`}
                className={
                    showLabel
                        ? "text-pretty text-[12px] leading-[1.5] text-muted-foreground"
                        : "sr-only"
                }
            >
                {SHARE_WORDS.linkNote}
            </p>
        </div>
    );
}
