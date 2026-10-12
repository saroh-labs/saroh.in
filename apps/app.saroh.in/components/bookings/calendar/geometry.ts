/**
 * How the diary turns minutes into pixels, and the two hatches it draws.
 * Shared by the day, the week and the blocks on them, so they agree.
 */

/** Pixels a minute takes on the diary: an hour is 48px (the design's 0.8). */
export const PX = 0.8;

/**
 * On a touch screen the day view draws a minute twice as tall (`--ppm`,
 * set on its wrapper): a 30-minute booking is then 48px, a whole thumb,
 * where 0.8 drew it at 24px. The phone shows one person, so the longer
 * day costs only scrolling. Anything outside the day view keeps 0.8.
 */
export const SCALE = `var(--ppm, ${PX}px)`;

/** How far down the diary a minute sits, from the first hour shown. */
export const at = (minute: number, from: number) =>
    `calc(${minute - from} * ${SCALE})`;

/** How tall a stretch of minutes is. */
export const tall = (a: number, b: number) =>
    `calc(${Math.max(0, b - a)} * ${SCALE})`;

/**
 * Closed time: a faint hatch, falling left to right. Free time is the plain
 * page, so the hatch alone says "not open".
 */
export const CLOSED_HATCH =
    "bg-[repeating-linear-gradient(135deg,transparent_0_7px,hsl(var(--muted)/0.7)_7px_9px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_7px,hsl(var(--muted))_7px_9px)]";

/**
 * Time off: wider bands in the danger tint, rising left to right, and it is
 * always labelled "Time off". The direction, the width and the words tell it
 * from closed time without the colour.
 */
export const OFF_HATCH =
    "bg-[repeating-linear-gradient(45deg,hsl(var(--destructive-subtle))_0_6px,transparent_6px_12px)]";
