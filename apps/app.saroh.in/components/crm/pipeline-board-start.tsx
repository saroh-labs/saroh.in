"use client";

import { useEffect } from "react";

import { stageAnchor } from "@/lib/crm/pipeline-board";

/** Where the board's columns stop being one-per-screen (Tailwind's `md`). */
const PHONE_QUERY = "(max-width: 767.98px)";

/**
 * On a phone, scrolls the board sideways to the first stage that holds a
 * lead (UX-077), once, when the page opens. A desk shows several columns
 * and stays where it is.
 */
export function PipelineBoardStart({ stageId }: { stageId: string | null }) {
    useEffect(() => {
        if (!stageId) return;
        if (!window.matchMedia(PHONE_QUERY).matches) return;
        const column = document.getElementById(stageAnchor(stageId));
        const board = column?.parentElement;
        if (!column || !board) return;
        board.scrollLeft = column.offsetLeft - board.offsetLeft;
    }, [stageId]);
    return null;
}
