/**
 * Times the way the redesign writes them (KIT.md, WORLD.md): 12-hour,
 * lower-case, "9:14 am"; an hour on its own is "9 am". Never 24-hour, never
 * "PM". Input is a 24-hour "HH:MM", the form a `<time>` element carries.
 */
function parts(at: string): { h: number; m: number } {
    const match = /^(\d{1,2}):(\d{2})$/.exec(at);
    if (!match) throw new Error(`Not an HH:MM time: "${at}"`);
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) throw new Error(`Not an HH:MM time: "${at}"`);
    return { h, m };
}

const half = (h: number) => (h < 12 ? "am" : "pm");
const twelve = (h: number) => (h % 12 === 0 ? 12 : h % 12);

/** "09:14" → "9:14 am"; "12:00" → "12:00 pm". */
export function clockLabel(at: string): string {
    const { h, m } = parts(at);
    return `${twelve(h)}:${String(m).padStart(2, "0")} ${half(h)}`;
}

/** "09:00" → "9 am", the hour label; minutes, if any, are dropped. */
export function hourLabel(at: string): string {
    const { h } = parts(at);
    return `${twelve(h)} ${half(h)}`;
}

/** "09:00" → "9am", a day's anchor (`/for/home-bakers#9am`). */
export function hourAnchor(at: string): string {
    return hourLabel(at).replace(" ", "");
}

/** The hour and minutes as numbers, for drawing (the sun's place). */
export function hourOf(at: string): number {
    const { h, m } = parts(at);
    return h + m / 60;
}

export type HourTint = "dawn" | "noon" | "afternoon" | "dusk" | "lamp";

/**
 * The light at an hour (Solutions' scenes only): dawn before 9, noon until
 * 1 pm, afternoon until 4 pm, dusk until 7 pm, then lamp.
 */
export function hourTint(at: string): HourTint {
    const h = hourOf(at);
    if (h < 9) return "dawn";
    if (h < 13) return "noon";
    if (h < 16) return "afternoon";
    if (h < 19) return "dusk";
    return "lamp";
}
