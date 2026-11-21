"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Tip } from "@saroh/ui/tooltip";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    EyeOff,
    GripVertical,
    Sparkles,
    Trash2,
} from "lucide-react";
import type { ReactElement } from "react";
import { useLayoutEffect, useRef, useState } from "react";

const TOOL = "h-9 gap-1.5 px-2.5 text-[13px] coarse:h-11 [&_svg]:size-4";
/** Below this section width the words fold to icons with tooltips. */
export const TOOLBAR_FOLD_PX = 640;

/**
 * The selected section's toolbar on the desk canvas (U47, `fix/WXKSelected`):
 * Move | Duplicate · Hide on phone · Delete | Ask AI. Move is a handle: ↑
 * and ↓ move it at once, a click opens Move up / Move down. Each acts at
 * once with Undo (G3). It stops the click reaching the section.
 *
 * It sits on the section's top edge, right-aligned and mostly above it, as
 * the board draws it, so it never covers the section's words; the tag at
 * the top left names the section. It never wraps: on a narrow section the
 * words fold to icons, each with a tooltip.
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
    const ref = useRef<HTMLDivElement>(null);
    const [folded, setFolded] = useState(false);
    useLayoutEffect(() => {
        const section = ref.current?.parentElement;
        if (!section || typeof ResizeObserver === "undefined") return;
        const fit = () => setFolded(section.clientWidth < TOOLBAR_FOLD_PX);
        fit();
        const watch = new ResizeObserver(fit);
        watch.observe(section);
        return () => watch.disconnect();
    }, []);

    /** A tool's words, or, folded, its icon with the words as a tooltip. */
    const tool = (name: string, button: ReactElement) =>
        folded ? <Tip label={name}>{button}</Tip> : button;
    const words = (name: string) => (folded ? null : name);
    const named = (name: string) => (folded ? { "aria-label": name } : {});

    return (
        <div
            ref={ref}
            role="toolbar"
            aria-label={`${label} actions`}
            data-section-toolbar=""
            data-folded={folded || undefined}
            onClick={(e) => e.stopPropagation()}
            className="absolute -top-6 right-3 z-20 flex flex-nowrap items-center gap-0.5 whitespace-nowrap rounded-[11px] border bg-card p-1 font-sans text-foreground shadow-[0_2px_4px_hsl(var(--shadow-color)/0.06),0_8px_22px_hsl(var(--shadow-color)/0.12)]"
        >
            <DropdownMenu>
                {tool(
                    "Move",
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className={TOOL}
                            aria-keyshortcuts="ArrowUp ArrowDown"
                            {...named("Move")}
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
                            {words("Move")}
                        </Button>
                    </DropdownMenuTrigger>,
                )}
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
            <Bar />
            {tool(
                "Duplicate",
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL}
                    {...named("Duplicate")}
                    onClick={onDuplicate}
                >
                    <Copy aria-hidden />
                    {words("Duplicate")}
                </Button>,
            )}
            {tool(
                "Hide on phone",
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL}
                    aria-pressed={hiddenOnPhone}
                    data-ph-unmask=""
                    {...named("Hide on phone")}
                    onClick={() => onHideOnPhone(!hiddenOnPhone)}
                >
                    <EyeOff aria-hidden />
                    {words("Hide on phone")}
                </Button>,
            )}
            {tool(
                "Delete",
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL}
                    {...named("Delete")}
                    onClick={onDelete}
                >
                    <Trash2 aria-hidden />
                    {words("Delete")}
                </Button>,
            )}
            {onAskAi ? (
                <>
                    <Bar />
                    {tool(
                        "Ask AI",
                        <Button
                            type="button"
                            variant="ghost"
                            className={TOOL}
                            {...named("Ask AI")}
                            onClick={onAskAi}
                        >
                            <Sparkles aria-hidden />
                            {words("Ask AI")}
                        </Button>,
                    )}
                </>
            ) : null}
        </div>
    );
}

function Bar() {
    return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
