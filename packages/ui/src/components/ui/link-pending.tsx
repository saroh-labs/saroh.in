"use client";

import { useLinkStatus } from "next/link";

/**
 * Drawn inside a `<Link>` that only changes what a screen shows (a tab, a
 * segment, a view): while the next render is on its way the old content
 * stays, and this sweeps under the link so the press is seen (Next's
 * `useLinkStatus`). The parent is `relative`.
 */
export function LinkPending() {
    const { pending } = useLinkStatus();
    // Two spans: `.skeleton-sweep` sets `position: relative` (unlayered CSS
    // beats the `absolute` utility), so the sweep sits inside a placed box.
    return pending ? (
        <span
            aria-hidden
            data-link-pending=""
            className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5"
        >
            <span className="skeleton-sweep block h-full w-full rounded-full bg-muted-foreground/40" />
        </span>
    ) : null;
}
