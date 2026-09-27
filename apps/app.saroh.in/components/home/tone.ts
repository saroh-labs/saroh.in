import type { BadgeProps } from "@saroh/ui/badge";

import type { HomeTone } from "@/lib/home/service";

/**
 * A Needs-you tag's tone, as the Home design colours it (F3), mapped to the
 * Badge's state variants rather than to colour classes:
 *
 * - `bad` — something already wrong ("Late · 2 days", "Blocked"): the
 *   danger tint, `error`.
 * - `due` — something to do soon ("Due today"): the Saffron tint, `draft`.
 * - `info` — something to know ("To set up"): filled Sunken, `neutral`.
 *
 * The words on the tag always say it too, so the colour is never the only
 * signal (13 §4). It replaces the old severity rail and badge: the flat list
 * is ranked by what has gone wrong, and the tag says what that is.
 */
export const TONE_BADGE: Record<
    HomeTone,
    NonNullable<BadgeProps["variant"]>
> = {
    bad: "error",
    due: "draft",
    info: "neutral",
};
