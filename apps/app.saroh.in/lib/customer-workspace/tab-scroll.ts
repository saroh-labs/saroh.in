/**
 * Customer Detail's tabs are one row that scrolls sideways on a phone
 * (default 28, C14). When the chosen tab is out of view — opened from a
 * link, picked with the arrow keys — the row scrolls just far enough to show
 * it whole, with a little of its neighbour beside it so the row reads as one
 * that goes on. Pure: the component measures, this decides.
 */

/** How much of the next tab stays in view beside the chosen one. */
export const TAB_PEEK = 24;

/**
 * Where the row should scroll to so the tab shows whole, or null when it
 * already does. `tab.left` is from the start of the row's content.
 */
export function scrollToShow(
    row: { scrollLeft: number; clientWidth: number; scrollWidth: number },
    tab: { left: number; width: number },
    peek = TAB_PEEK,
): number | null {
    const start = row.scrollLeft;
    const end = start + row.clientWidth;
    const max = Math.max(0, row.scrollWidth - row.clientWidth);
    if (tab.left < start) return Math.max(0, tab.left - peek);
    if (tab.left + tab.width > end) {
        return Math.min(max, tab.left + tab.width - row.clientWidth + peek);
    }
    return null;
}
