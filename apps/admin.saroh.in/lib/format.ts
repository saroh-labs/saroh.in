/**
 * How the console says times, counts and keys. One place, so every screen
 * says them the same way.
 */

const DATE = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
});

export function formatDate(value: string | Date | null | undefined): string {
    return value ? DATE.format(new Date(value)) : "—";
}

export function formatDateTime(
    value: string | Date | null | undefined,
): string {
    return value ? DATE_TIME.format(new Date(value)) : "—";
}

/** "3 days ago", "just now", "in 2 hours". Rounded to the unit that reads. */
export function formatRelative(
    value: string | Date | null | undefined,
    now: Date = new Date(),
): string {
    if (!value) return "Never";
    const diff = new Date(value).getTime() - now.getTime();
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["day", 86_400_000],
        ["hour", 3_600_000],
        ["minute", 60_000],
    ];
    for (const [unit, ms] of units) {
        if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
    }
    return "just now";
}

/** `COMMERCE` → "Commerce", `organization.plan.changed` → "Organization plan changed". */
export function asWords(key: string): string {
    const words = key
        .toLowerCase()
        .replace(/[_.:-]+/g, " ")
        .trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/** `teamMembers` → "Team members". */
export function camelToWords(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

export function plural(count: number, one: string, other = `${one}s`): string {
    return `${count} ${count === 1 ? one : other}`;
}
