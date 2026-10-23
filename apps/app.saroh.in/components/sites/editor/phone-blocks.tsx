"use client";

import { cn } from "@saroh/ui/lib/utils";
import { GripVertical, PanelBottom, PanelTop } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

import { SECTION_ICONS } from "@/components/sites/blocks/block-icons";
import type { FixedPart } from "@/components/sites/editor/use-editor-selection";
import type { Flag, Section } from "@/lib/sites/service";
import { SECTION_LABELS, sectionTitle } from "./editor-constants";

/**
 * "Blocks on {Page}" (DEC-185): a phone's block list, every block in
 * order with its name and first line, the header and footer marked Fixed.
 * A tap selects the block (the sheet makes way for its settings, and the
 * page scrolls to it). The grip drags a block to another place, the same
 * move the desk's rail makes, with its Undo; Up and Down on the grip move
 * it one place for the keyboard.
 */
export function PhoneBlocks({
    sections,
    selectedIndex,
    selectedChrome,
    onSelect,
    onSelectChrome,
    moveTo,
    flagsBySection,
    notedKeys,
}: {
    sections: Section[];
    selectedIndex: number | null;
    selectedChrome: FixedPart | null;
    onSelect: (index: number) => void;
    onSelectChrome: (part: FixedPart) => void;
    /** The move with Undo (`useUndo`). */
    moveTo: (from: number, to: number) => void;
    flagsBySection: Map<number, Flag[]>;
    notedKeys: Set<string>;
}) {
    const list = useRef<HTMLUListElement>(null);
    const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

    /** The block row whose middle is nearest a point on the screen. */
    function rowAt(y: number): number {
        const rows = Array.from(
            list.current?.querySelectorAll<HTMLElement>("[data-row-index]") ??
                [],
        );
        return nearestRow(
            y,
            rows.map((row) => {
                const box = row.getBoundingClientRect();
                return box.top + box.height / 2;
            }),
        );
    }

    const grip = (index: number) => ({
        onPointerDown(e: PointerEvent<HTMLButtonElement>) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({ from: index, to: index });
        },
        onPointerMove(e: PointerEvent<HTMLButtonElement>) {
            if (drag?.from !== index) return;
            setDrag({ from: index, to: rowAt(e.clientY) });
        },
        onPointerUp(e: PointerEvent<HTMLButtonElement>) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            if (drag?.from === index && drag.to !== index) {
                moveTo(index, drag.to);
            }
            setDrag(null);
        },
        onPointerCancel() {
            setDrag(null);
        },
        onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
            const to =
                e.key === "ArrowUp"
                    ? index - 1
                    : e.key === "ArrowDown"
                      ? index + 1
                      : null;
            if (to === null || to < 0 || to >= sections.length) return;
            e.preventDefault();
            moveTo(index, to);
        },
    });

    return (
        <ul
            ref={list}
            aria-label="Blocks on this page"
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        >
            <FixedRow
                part="header"
                selected={selectedChrome === "header"}
                onSelect={() => onSelectChrome("header")}
            />
            {sections.map((section, index) => {
                const Icon = SECTION_ICONS[section.type];
                const label = SECTION_LABELS[section.type];
                const line = sectionTitle(section);
                const flagged =
                    (flagsBySection.get(index)?.length ?? 0) > 0 ||
                    (section.key !== undefined && notedKeys.has(section.key));
                return (
                    <li
                        key={index}
                        data-row-index={index}
                        className={cn(
                            "flex items-center gap-1 rounded-lg",
                            drag?.from === index && "opacity-40",
                            drag?.to === index &&
                                drag.from !== index &&
                                "ring-1 ring-inset ring-ring",
                        )}
                    >
                        <button
                            type="button"
                            aria-current={
                                selectedIndex === index ? "true" : undefined
                            }
                            onClick={() => onSelect(index)}
                            className={cn(
                                "flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selectedIndex === index && "bg-secondary",
                            )}
                        >
                            <Icon
                                aria-hidden
                                className="size-[18px] shrink-0 text-muted-foreground"
                            />
                            <span className="grid min-w-0 flex-1">
                                <span
                                    className={cn(
                                        "truncate text-sm font-semibold",
                                        section.hidden &&
                                            "text-muted-foreground line-through",
                                    )}
                                >
                                    {label}
                                </span>
                                {line !== label ? (
                                    <span className="truncate text-xs text-muted-foreground">
                                        {line}
                                    </span>
                                ) : null}
                            </span>
                            {section.hidden ? (
                                <span className="label shrink-0 rounded bg-muted px-1.5 py-px">
                                    Hidden
                                </span>
                            ) : null}
                            {flagged ? (
                                <span
                                    aria-label="Worth a look"
                                    className="size-1.5 shrink-0 rounded-full bg-foreground"
                                />
                            ) : null}
                        </button>
                        <button
                            type="button"
                            aria-label={`Move ${label}: drag, or press Up or Down`}
                            {...grip(index)}
                            className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        >
                            <GripVertical aria-hidden className="size-[18px]" />
                        </button>
                    </li>
                );
            })}
            <FixedRow
                part="footer"
                selected={selectedChrome === "footer"}
                onSelect={() => onSelectChrome("footer")}
            />
        </ul>
    );
}

/** The header or footer: on every page, so it is Fixed, never moved. */
function FixedRow({
    part,
    selected,
    onSelect,
}: {
    part: FixedPart;
    selected: boolean;
    onSelect: () => void;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={onSelect}
                className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-secondary",
                )}
            >
                <Icon
                    aria-hidden
                    className="size-[18px] shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 flex-1">
                    <span className="text-sm font-semibold">
                        {part === "header" ? "Header" : "Footer"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        On every page
                    </span>
                </span>
                <span className="label shrink-0 rounded bg-muted px-1.5 py-px">
                    Fixed
                </span>
            </button>
        </li>
    );
}

/** Which of the rows, by their middles, a dragged point is nearest. */
export function nearestRow(y: number, middles: readonly number[]): number {
    let best = 0;
    middles.forEach((mid, i) => {
        if (Math.abs(y - mid) < Math.abs(y - (middles[best] ?? mid))) best = i;
    });
    return best;
}
