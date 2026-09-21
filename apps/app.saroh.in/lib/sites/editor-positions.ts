import type { Flag } from "./service";

/**
 * Where a new block goes (#337): after the selected block, or at the end
 * when nothing is selected — or when the remembered selection is past the
 * end, which a stale index can be.
 */
export function insertPosition(
    selectedIndex: number | null,
    length: number,
): number {
    if (
        selectedIndex === null ||
        selectedIndex < 0 ||
        selectedIndex >= length
    ) {
        return length;
    }
    return selectedIndex + 1;
}

/**
 * The server's flags for this page, keyed by the block's position ON SCREEN.
 *
 * A flag's `sectionIndex` counts positions in the list the last save SENT,
 * and a save leaves out a block that is not finished yet (`saveableSections`).
 * With an unfinished block in the middle of the page, every later block's
 * sent position is one less than its position on screen — so a flag keyed by
 * the raw index would draw its dot on the block above the one it is about.
 * `sentFrom[i]` is the on-screen position of the i-th sent block, the same
 * mapping save errors already go through.
 */
export function flagsByScreenPosition(
    flags: readonly Flag[],
    pageId: string,
    sentFrom: readonly number[],
): Map<number, Flag[]> {
    const out = new Map<number, Flag[]>();
    for (const flag of flags) {
        if (flag.pageId !== pageId || flag.sectionIndex === null) continue;
        const index = sentFrom[flag.sectionIndex] ?? flag.sectionIndex;
        const list = out.get(index) ?? [];
        list.push(flag);
        out.set(index, list);
    }
    return out;
}
