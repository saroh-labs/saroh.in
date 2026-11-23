"use client";

import { Plus } from "lucide-react";
import type { DragEvent as ReactDragEvent, RefObject } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { Section, SectionType } from "@/lib/sites/service";

import { SECTION_LABELS, sectionTitle } from "../editor-constants";

/** The drag's data type: a section type, never anything a page could read. */
const MIME = "application/x-saroh-section";

/**
 * Where a drop lands among the canvas's sections: after the section at
 * `after`. Every gap below a section counts; above the first is read as
 * below it.
 * shortcut: no drop above the first section (insertion is "below the
 * selected one"); add a moveTo after insert if the top is ever wanted.
 */
export function dropAfter(mids: readonly number[], y: number): number {
    const below = mids.findIndex((mid) => y < mid);
    return below === -1 ? mids.length - 1 : Math.max(0, below - 1);
}

/** "Drops between Bridal packages and From our brides" (A4). */
export function dropWords(after: string, next: string | null): string {
    return next
        ? `Drops between ${after} and ${next}`
        : `Drops at the end, below ${after}`;
}

interface Marker {
    top: number;
    left: number;
    width: number;
    words: string;
    after: number;
}

/**
 * Drag a section from Add onto the desk canvas (A4, `fix/WXKLibrary`): a
 * line marks where it drops, named by the sections either side, and the
 * drop adds it there exactly as a click adds below the selected section.
 * Desk only: the phone's canvas sits in a frame a drag can't cross.
 */
export function useCanvasDrop({
    canvasRef,
    sections,
    setSelectedIndex,
    desk,
    onDrop,
}: {
    canvasRef: RefObject<HTMLDivElement | null>;
    sections: readonly Section[];
    setSelectedIndex: (index: number | null) => void;
    /** A desk, and someone who may change the page. */
    desk: boolean;
    onDrop: (type: SectionType) => void;
}) {
    const [dragging, setDragging] = useState<SectionType | null>(null);
    const [marker, setMarker] = useState<Marker | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!dragging || !canvas) return;
        const blocks = () =>
            Array.from(
                canvas.querySelectorAll<HTMLElement>("[data-block-index]"),
            ).sort(
                (a, b) =>
                    Number(a.dataset.blockIndex) - Number(b.dataset.blockIndex),
            );
        const over = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes(MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            const list = blocks();
            if (list.length === 0) return;
            const rects = list.map((b) => b.getBoundingClientRect());
            const after = dropAfter(
                rects.map((r) => r.top + r.height / 2),
                e.clientY,
            );
            const r = rects[after];
            const here = sections.at(after);
            const next = sections.at(after + 1);
            if (!here) return;
            setMarker({
                top: r.bottom,
                left: r.left,
                width: r.width,
                after,
                words: dropWords(
                    sectionTitle(here),
                    next ? sectionTitle(next) : null,
                ),
            });
        };
        const leave = (e: DragEvent) => {
            if (!canvas.contains(e.relatedTarget as Node | null)) {
                setMarker(null);
            }
        };
        const drop = (e: DragEvent) => {
            const type = e.dataTransfer?.getData(MIME);
            if (!type) return;
            e.preventDefault();
            const list = blocks();
            const after = list.length
                ? dropAfter(
                      list.map((b) => {
                          const r = b.getBoundingClientRect();
                          return r.top + r.height / 2;
                      }),
                      e.clientY,
                  )
                : null;
            setSelectedIndex(after);
            onDrop(type as SectionType);
            setMarker(null);
            setDragging(null);
        };
        const end = () => {
            setMarker(null);
            setDragging(null);
        };
        canvas.addEventListener("dragover", over);
        canvas.addEventListener("dragleave", leave);
        canvas.addEventListener("drop", drop);
        window.addEventListener("dragend", end);
        return () => {
            canvas.removeEventListener("dragover", over);
            canvas.removeEventListener("dragleave", leave);
            canvas.removeEventListener("drop", drop);
            window.removeEventListener("dragend", end);
        };
    }, [dragging, canvasRef, sections, setSelectedIndex, onDrop]);

    /** The props a card takes to be dragged; none on a phone. */
    const dragProps = !desk
        ? () => undefined
        : (type: SectionType) => (e: ReactDragEvent<HTMLElement>) => {
              e.dataTransfer.setData(MIME, type);
              e.dataTransfer.effectAllowed = "copy";
              dragGhost(e.dataTransfer, SECTION_LABELS[type]);
              setDragging(type);
          };

    const line =
        marker && typeof document !== "undefined"
            ? createPortal(
                  <div
                      aria-hidden
                      data-drop-marker={marker.after}
                      className="pointer-events-none fixed z-50 -translate-y-1/2"
                      style={{
                          top: marker.top,
                          left: marker.left,
                          width: marker.width,
                      }}
                  >
                      {/* An ink line across the page with the pill on it,
                          + first (A4, `fix/WXKLibrary`). */}
                      <div className="h-0.5 w-full rounded-full bg-foreground" />
                      <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-sm">
                          <Plus aria-hidden className="size-3.5" />
                          {marker.words}
                      </span>
                  </div>,
                  document.body,
              )
            : null;

    return { dragProps, line };
}

/**
 * The card under the pointer while a section is dragged (A4,
 * `fix/WXKLibrary`): its name on a small card, not the browser's faded
 * copy of the whole row. Drawn off screen for the browser to picture,
 * then removed.
 */
function dragGhost(transfer: DataTransfer, label: string) {
    if (typeof document === "undefined" || !("setDragImage" in transfer))
        return;
    const card = document.createElement("div");
    card.textContent = `+ ${label}`;
    card.className =
        "fixed -left-[999px] top-0 rounded-lg border bg-card px-3 py-2 font-sans text-sm font-semibold text-foreground shadow-lg";
    document.body.appendChild(card);
    transfer.setDragImage(card, 16, 16);
    setTimeout(() => card.remove(), 0);
}
