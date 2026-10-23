"use client";

import { Layers, Palette, Plus } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * A phone's one floating pill (DEC-185), in place of the bottom tabs:
 * Blocks · + · Brand, at the foot of the page where a thumb is. It is not
 * drawn while a sheet is open over the page, nor while the keyboard is up.
 */
export function EditPill({
    hidden,
    onBlocks,
    onAdd,
    onBrand,
}: {
    /** A sheet or a dialog is over the page. */
    hidden: boolean;
    onBlocks: () => void;
    onAdd: () => void;
    onBrand: () => void;
}) {
    const keyboard = useKeyboardUp();
    if (hidden || keyboard) return null;
    const item =
        "flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors duration-fast hover:bg-background/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    return (
        <div
            role="toolbar"
            aria-label="Edit page"
            data-edit-pill=""
            className="absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground p-1 text-background shadow-xl shadow-black/25"
        >
            <button type="button" onClick={onBlocks} className={item}>
                <Layers aria-hidden className="size-[18px]" />
                Blocks
            </button>
            <button
                type="button"
                aria-label="Add a block"
                onClick={onAdd}
                className="grid size-11 place-items-center rounded-full bg-background text-foreground transition-colors duration-fast hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Plus aria-hidden className="size-5" />
            </button>
            <button type="button" onClick={onBrand} className={item}>
                <Palette aria-hidden className="size-[18px]" />
                Brand
            </button>
        </div>
    );
}

/**
 * Whether an on-screen keyboard has taken the foot of the screen: the
 * visual viewport is much shorter than the window. False where the
 * browser has no visual viewport.
 */
export function useKeyboardUp(): boolean {
    return useSyncExternalStore(subscribeViewport, keyboardUpNow, () => false);
}

/** A keyboard takes at least this much of the window's height. */
const KEYBOARD_PX = 150;

export function keyboardUpNow(): boolean {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    return vv ? window.innerHeight - vv.height > KEYBOARD_PX : false;
}

function subscribeViewport(onChange: () => void): () => void {
    const vv = window.visualViewport;
    if (!vv) return () => undefined;
    vv.addEventListener("resize", onChange);
    return () => vv.removeEventListener("resize", onChange);
}
