"use client";

import { Button } from "@saroh/ui/button";
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

import { SECTION_LABELS, sectionTitle } from "../editor-constants";
import { EditorSheet } from "../editor-sheet";
import { sectionActions } from "../inspector/section-actions";
import { frameOf } from "../inspector/section-frame";
import { nearestRow } from "../phone-blocks";
import type { EditorModel } from "../shell/editor-model";

/** The board's 44px icon buttons, glyph at 18. */
const ICON = "size-11 rounded-[9px] text-muted-foreground [&_svg]:size-[18px]";

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
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <ul
                    ref={list}
                    aria-label="Sections, top to bottom"
                    data-sections-sheet=""
                    className="divide-y overflow-hidden rounded-xl border bg-card"
                >
                    <PinnedRow
                        part="header"
                        readOnly={readOnly}
                        onOpen={chooseChrome}
                    />
                    {sections.map((section, index) => {
                        const name = sectionTitle(section);
                        const kind = SECTION_LABELS[section.type];
                        const offPhone = frameOf(section).hideOn === "phone";
                        const line = section.hidden
                            ? "Hidden when published"
                            : offPhone
                              ? "Hidden on phone"
                              : name === kind
                                ? null
                                : kind;
                        return (
                            <li
                                key={section.key ?? index}
                                data-row-index={index}
                                className={cn(
                                    "flex min-h-[60px] items-center gap-0.5 pr-1",
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
                                            "truncate text-[0.9375rem] font-semibold",
                                            (section.hidden === true ||
                                                offPhone) &&
                                                "text-muted-foreground",
                                        )}
                                    >
                                        {name}
                                    </span>
                                    {line ? (
                                        <span className="truncate text-[0.8125rem] text-muted-foreground">
                                            {line}
                                        </span>
                                    ) : null}
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
                                            className={ICON}
                                        />
                                        <IconButton
                                            label={`Move ${name} down`}
                                            icon={<ArrowDown />}
                                            tooltip={false}
                                            disabled={
                                                index === sections.length - 1
                                            }
                                            onClick={() => edits.move(index, 1)}
                                            className={ICON}
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
                        readOnly={readOnly}
                        onOpen={chooseChrome}
                    />
                </ul>
            </div>
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
    readOnly,
    onOpen,
}: {
    part: FixedPart;
    readOnly: boolean;
    onOpen: (part: FixedPart) => void;
}) {
    const name = part === "header" ? "Header" : "Footer";
    return (
        <li className="flex min-h-[60px] items-center gap-0.5 pr-1">
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
