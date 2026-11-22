"use client";

import { Button } from "@saroh/ui/button";
import { FormSheetBody } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    EyeOff,
    GripVertical,
    Lock,
    Plus,
    Smartphone,
    X,
} from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

import type { FixedPart } from "@/components/sites/editor/use-editor-selection";

import { SECTION_SHOWS, sectionTitle } from "../editor-constants";
import { EditorSheet } from "../editor-sheet";
import { sectionActions } from "../inspector/section-actions";
import { frameOf } from "../inspector/section-frame";
import { nearestRow } from "../phone-blocks";
import type { EditorModel } from "../shell/editor-model";

/** The board's 44px icon buttons, glyph at 18. */
const ICON =
    "size-11 rounded-[9px] text-muted-foreground disabled:text-disabled-foreground [&_svg]:size-[18px]";
/** An arrow that cannot move further is greyed: the disabled edge's ink (P1). */
const ARROW = cn(ICON, "disabled:text-[hsl(var(--disabled-border))]");

/**
 * "Sections on this page" (U49, `fix/WXNReorder`), full screen from the
 * bar's Sections: the header pinned at the top, each section with what it
 * shows, the footer pinned at the foot. A section is dragged by its grip,
 * or moved a place with Up and Down (the grip's arrow keys too), each with
 * the toast's Undo ("Gallery moved up · Undo"); the phone button hides it
 * on phones. Tapping a row opens its section sheet. A reader taps rows
 * and nothing else.
 */
export function SectionsSheet({
    model,
    open,
    container,
    onClose,
    onAdd,
    onPick,
}: {
    model: EditorModel;
    open: boolean;
    /** The whole phone editor, so the sheet covers both bars. */
    container: HTMLElement | null;
    onClose: () => void;
    /** Add a section: the bar's Add sheet. */
    onAdd: () => void;
    /** A section was chosen: the page scrolls to it. */
    onPick: (index: number) => void;
}) {
    const { draft, edits, selection, readOnly, page } = model;
    const { sections } = draft;
    const act = sectionActions(model);
    const list = useRef<HTMLUListElement>(null);
    const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

    const rowAt = (y: number) =>
        nearestRow(
            y,
            Array.from(
                list.current?.querySelectorAll<HTMLElement>(
                    "[data-row-index]",
                ) ?? [],
            ).map((row) => {
                const box = row.getBoundingClientRect();
                return box.top + box.height / 2;
            }),
        );

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
                edits.moveTo(index, drag.to);
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
            edits.moveTo(index, to);
        },
    });

    const chooseChrome = (part: FixedPart) => selection.selectChrome(part);

    return (
        <EditorSheet
            open={open}
            onClose={onClose}
            container={container}
            side="bottom"
            title="Sections on this page"
            closeLabel="Close sections"
            full
            head={
                <div className="flex min-h-[60px] shrink-0 items-center gap-2 border-b pl-4 pr-1.5">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold leading-tight">
                            Sections on this page
                        </h2>
                        <p className="truncate text-[0.8125rem] text-muted-foreground">
                            {page?.title ?? "This page"}
                        </p>
                    </div>
                    <IconButton
                        label="Close sections"
                        icon={<X />}
                        onClick={onClose}
                        tooltip={false}
                        className={cn(ICON, "[&_svg]:size-5")}
                    />
                </div>
            }
        >
            <FormSheetBody className="mx-0 block gap-0 px-4 py-3">
                <ul
                    ref={list}
                    aria-label="Sections, top to bottom"
                    data-sections-sheet=""
                    className="divide-y overflow-hidden rounded-xl border bg-card"
                >
                    <PinnedRow
                        part="header"
                        selected={selection.selectedChrome === "header"}
                        readOnly={readOnly}
                        onOpen={chooseChrome}
                    />
                    {sections.map((section, index) => {
                        const name = sectionTitle(section);
                        const offPhone = frameOf(section).hideOn === "phone";
                        // Every row says what it shows (P1, `fix/WXNReorder`).
                        const line = section.hidden
                            ? "Hidden when published"
                            : offPhone
                              ? "Hidden on phone"
                              : SECTION_SHOWS[section.type];
                        return (
                            <li
                                key={section.key ?? index}
                                data-row-index={index}
                                aria-current={
                                    selection.selectedIndex === index
                                        ? "true"
                                        : undefined
                                }
                                className={cn(
                                    "flex min-h-[60px] items-center gap-0.5 pr-1",
                                    // The open section, in the selected fill (P1).
                                    selection.selectedIndex === index &&
                                        "bg-muted",
                                    readOnly && "pl-1",
                                    drag?.from === index && "opacity-40",
                                    drag?.to === index &&
                                        drag.from !== index &&
                                        "ring-1 ring-inset ring-ring",
                                )}
                            >
                                {readOnly ? null : (
                                    <IconButton
                                        label={`Drag to move ${name}`}
                                        icon={<GripVertical />}
                                        tooltip={false}
                                        {...grip(index)}
                                        className={cn(
                                            ICON,
                                            "cursor-grab touch-none active:cursor-grabbing",
                                        )}
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        selection.setSelectedIndex(index);
                                        onPick(index);
                                    }}
                                    className="grid min-h-11 min-w-0 flex-1 rounded-lg px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span
                                        data-ph-mask=""
                                        className={cn(
                                            // Two lines before a long name is cut (P1).
                                            "line-clamp-2 break-words text-[0.9375rem] font-semibold",
                                            (section.hidden === true ||
                                                offPhone) &&
                                                "text-muted-foreground",
                                        )}
                                    >
                                        {name}
                                    </span>
                                    <span className="truncate text-[0.8125rem] text-muted-foreground">
                                        {line}
                                    </span>
                                </button>
                                {readOnly ? null : (
                                    <>
                                        <IconButton
                                            label={`Move ${name} up`}
                                            icon={<ArrowUp />}
                                            tooltip={false}
                                            disabled={index === 0}
                                            onClick={() =>
                                                edits.move(index, -1)
                                            }
                                            className={ARROW}
                                        />
                                        <IconButton
                                            label={`Move ${name} down`}
                                            icon={<ArrowDown />}
                                            tooltip={false}
                                            disabled={
                                                index === sections.length - 1
                                            }
                                            onClick={() => edits.move(index, 1)}
                                            className={ARROW}
                                        />
                                        <IconButton
                                            label={`Hide ${name} on phone`}
                                            icon={
                                                offPhone ? (
                                                    <EyeOff />
                                                ) : (
                                                    <Smartphone />
                                                )
                                            }
                                            tooltip={false}
                                            aria-pressed={offPhone}
                                            onClick={() =>
                                                act.hideOnPhone(
                                                    index,
                                                    !offPhone,
                                                )
                                            }
                                            className={cn(
                                                ICON,
                                                offPhone &&
                                                    "bg-secondary text-foreground",
                                            )}
                                        />
                                    </>
                                )}
                            </li>
                        );
                    })}
                    <PinnedRow
                        part="footer"
                        selected={selection.selectedChrome === "footer"}
                        readOnly={readOnly}
                        onOpen={chooseChrome}
                    />
                </ul>
            </FormSheetBody>
            <div className="flex shrink-0 gap-2 border-t px-4 pb-3 pt-2.5">
                {readOnly ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-12 min-w-0 flex-1"
                        onClick={onAdd}
                    >
                        <Plus aria-hidden className="size-4" />
                        Add a section
                    </Button>
                )}
                <Button
                    type="button"
                    className="h-12 min-w-0 flex-1"
                    onClick={onClose}
                >
                    Done
                </Button>
            </div>
        </EditorSheet>
    );
}

/** The header or the footer: on every page, so it is never moved here. */
function PinnedRow({
    part,
    selected,
    readOnly,
    onOpen,
}: {
    part: FixedPart;
    /** Open in its sheet: the selected fill over the tint (P1). */
    selected: boolean;
    readOnly: boolean;
    onOpen: (part: FixedPart) => void;
}) {
    const name = part === "header" ? "Header" : "Footer";
    return (
        // Tinted: it never moves (P1, `fix/WXNReorder`).
        <li
            aria-current={selected ? "true" : undefined}
            className={cn(
                "flex min-h-[60px] items-center gap-0.5 pr-1",
                selected ? "bg-muted" : "bg-background",
            )}
        >
            <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center text-muted-foreground"
            >
                <Lock className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1 px-2">
                <span className="text-[0.9375rem] font-semibold">{name}</span>
                <span className="truncate text-[0.8125rem] text-muted-foreground">
                    {`On every page · stays at the ${part === "header" ? "top" : "bottom"}`}
                </span>
            </span>
            <IconButton
                label={`${readOnly ? "Open" : "Change"} the ${part}`}
                icon={<ChevronRight />}
                tooltip={false}
                onClick={() => onOpen(part)}
                className={ICON}
            />
        </li>
    );
}
