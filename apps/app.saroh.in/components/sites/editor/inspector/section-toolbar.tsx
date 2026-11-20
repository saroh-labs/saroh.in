"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    EyeOff,
    GripVertical,
    Sparkles,
    Trash2,
} from "lucide-react";

const TOOL = "h-9 gap-1.5 px-2.5 text-[13px] coarse:h-11 [&_svg]:size-4";

/**
 * The selected section's toolbar on the desk canvas (U47, `fix/WXKSelected`):
 * its name, then Move · Duplicate · Hide on phone · Delete · Ask AI. Move is
 * a handle: ↑ and ↓ move it at once, a click opens Move up / Move down. Each
 * acts at once with Undo (G3). It stops the click reaching the section.
 */
export function SectionToolbar({
    label,
    index,
    count,
    hiddenOnPhone,
    onMove,
    onDuplicate,
    onHideOnPhone,
    onDelete,
    onAskAi,
}: {
    /** The section's name, as its tree row says it. */
    label: string;
    index: number;
    count: number;
    hiddenOnPhone: boolean;
    onMove: (delta: -1 | 1) => void;
    onDuplicate: () => void;
    onHideOnPhone: (hide: boolean) => void;
    onDelete: () => void;
    /** Absent when Ask AI is off for this person. */
    onAskAi?: () => void;
}) {
    return (
        <div
            role="toolbar"
            aria-label={`${label} actions`}
            data-section-toolbar=""
            onClick={(e) => e.stopPropagation()}
            className="absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-0.5 rounded-xl border bg-card p-1 font-sans text-foreground shadow-[0_8px_20px_hsl(var(--shadow-color)/0.18)]"
        >
            <span
                data-ph-mask=""
                className="max-w-[16ch] truncate px-2 text-[13px] font-semibold"
            >
                {label}
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        className={TOOL}
                        aria-keyshortcuts="ArrowUp ArrowDown"
                        onKeyDown={(e) => {
                            const delta =
                                e.key === "ArrowUp"
                                    ? -1
                                    : e.key === "ArrowDown"
                                      ? 1
                                      : 0;
                            if (delta === 0) return;
                            e.preventDefault();
                            const to = index + delta;
                            if (to >= 0 && to < count) onMove(delta);
                        }}
                    >
                        <GripVertical aria-hidden />
                        Move
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    <DropdownMenuItem
                        disabled={index === 0}
                        onSelect={() => onMove(-1)}
                    >
                        <ArrowUp aria-hidden />
                        Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={index >= count - 1}
                        onSelect={() => onMove(1)}
                    >
                        <ArrowDown aria-hidden />
                        Move down
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <Button
                type="button"
                variant="ghost"
                className={TOOL}
                onClick={onDuplicate}
            >
                <Copy aria-hidden />
                Duplicate
            </Button>
            <Button
                type="button"
                variant="ghost"
                className={TOOL}
                aria-pressed={hiddenOnPhone}
                onClick={() => onHideOnPhone(!hiddenOnPhone)}
            >
                <EyeOff aria-hidden />
                Hide on phone
            </Button>
            <Button
                type="button"
                variant="ghost"
                className={TOOL}
                onClick={onDelete}
            >
                <Trash2 aria-hidden />
                Delete
            </Button>
            {onAskAi ? (
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL}
                    onClick={onAskAi}
                >
                    <Sparkles aria-hidden />
                    Ask AI
                </Button>
            ) : null}
        </div>
    );
}
