/** Titles that come before a name and aren't what anyone is called by. */
const TITLES = new Set([
    "dr",
    "mr",
    "mrs",
    "ms",
    "miss",
    "prof",
    "shri",
    "smt",
]);

/**
 * A name past the titles in front of it: "Arun Pillai" from "Dr. Arun
 * Pillai". A name that is only a title stays as it is.
 */
export function withoutTitle(name: string | null | undefined): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const at = words.findIndex(
        (w) => !TITLES.has(w.replace(/\.$/, "").toLowerCase()),
    );
    return at <= 0 ? words.join(" ") : words.slice(at).join(" ");
}

/**
 * What someone is called by: "Meenakshi" from "Dr. Meenakshi Rao", "Meera"
 * from "Meera Iyer". An email stays whole; a name that is only a title
 * keeps it ("Dr."). Empty in, empty out.
 */
export function firstName(name: string | null | undefined): string {
    const text = (name ?? "").trim();
    if (text.includes("@")) return text;
    const words = text.split(/\s+/).filter(Boolean);
    return (
        words.find((w) => !TITLES.has(w.replace(/\.$/, "").toLowerCase())) ??
        words.at(0) ??
        ""
    );
}
