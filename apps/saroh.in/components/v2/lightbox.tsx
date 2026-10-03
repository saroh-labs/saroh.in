"use client";

import { useRef } from "react";

import type { Shot } from "@/content/shots";

import { ShotImage } from "./shot-image";
import { useFocusTrap } from "./use-focus-trap";

/**
 * A screenshot, enlarged (the Features and Solutions designs' zoom): Ink at
 * 82% behind, the image up to 1440px wide. Click anywhere or press Esc to
 * close; while open, focus stays inside, and on close it returns to the
 * screenshot that opened it.
 */
export function Lightbox({
    shot,
    alt,
    onClose,
}: {
    shot: Shot;
    alt: string;
    onClose: () => void;
}) {
    const root = useRef<HTMLDivElement>(null);
    const close = useRef<HTMLButtonElement>(null);
    useFocusTrap(root, true, onClose, close);
    return (
        <div
            ref={root}
            role="dialog"
            aria-modal="true"
            aria-label="Screenshot, enlarged"
            onClick={onClose}
            className="fixed inset-0 z-[80] grid cursor-zoom-out place-items-center overflow-auto bg-mk-scrim p-6"
        >
            <div className="w-full max-w-[1440px] overflow-hidden rounded-xl shadow-mk-zoom">
                <ShotImage shot={shot} alt={alt} sizes="100vw" />
            </div>
            <button
                ref={close}
                type="button"
                onClick={onClose}
                className="fixed right-5 top-4 cursor-pointer rounded-md bg-transparent text-sm text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-background focus-visible:[outline-style:solid]"
            >
                Click anywhere or press Esc to close
            </button>
        </div>
    );
}
