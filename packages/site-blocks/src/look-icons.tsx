import type { LookId } from "@saroh/block-contract";

/**
 * The chrome's line icons under a look (DEC-172, U5), as the fixed boards
 * draw them: Folio's square ends at 1.5, Quiet's round ends at 1.25, Live's
 * at 1.75. Always beside words or inside a named control, so each is
 * `aria-hidden`. No `"use client"`: the server's header and the browser's
 * menu and dock draw the same marks.
 */
export type LookIconName =
    | "menu"
    | "close"
    | "arrow"
    | "home"
    | "book"
    | "shop"
    | "you"
    | "page"
    | "call"
    | "chat";

const PATHS: Record<LookIconName, string> = {
    menu: "M4 7h16M4 12h16M4 17h16",
    close: "M6 6l12 12M18 6L6 18",
    arrow: "M5 12h14M13 6l6 6-6 6",
    home: "M4 10.5L12 4l8 6.5V20h-5.5v-6h-5v6H4z",
    book: "M12 5v14M5 12h14",
    shop: "M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5",
    you: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    page: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    call: "M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z",
    chat: "M4 5h16v11H9l-5 4z",
};

/** Quiet's menu is two lines (VDHeader); the others draw three. */
const QUIET_MENU = "M4 8h16M4 16h16";

const STROKE: Record<LookId, { width: number; cap: "square" | "round" }> = {
    folio: { width: 1.5, cap: "square" },
    quiet: { width: 1.25, cap: "round" },
    live: { width: 1.75, cap: "round" },
};

export function LookIcon({
    name,
    look,
    size = 22,
}: {
    name: LookIconName;
    look: LookId;
    size?: number;
}) {
    const stroke = STROKE[look];
    const d = name === "menu" && look === "quiet" ? QUIET_MENU : PATHS[name];
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke.width}
            strokeLinecap={stroke.cap}
            strokeLinejoin={stroke.cap === "square" ? "miter" : "round"}
            aria-hidden="true"
            className="block shrink-0"
        >
            <path d={d} />
        </svg>
    );
}
