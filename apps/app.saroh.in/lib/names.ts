import { isNameTitle, NAME_TITLES, nameInitials } from "@saroh/ui/lib/names";

export { isNameTitle };

/**
 * Titles that come before a name and aren't what anyone is called by: the
 * one list, shared with the avatar (`@saroh/ui/lib/names`).
 */
export const TITLES = NAME_TITLES;

/**
 * A person's initials, for a round avatar: the avatar's own rule, so a name
 * reads the same everywhere. "Dr. Arun Kumar Pillai" is "AP", "Zara" is
 * "ZA", and no name is "?".
 */
export function initials(name: string | null | undefined): string {
    return nameInitials(name);
}

/**
 * A name past the titles in front of it: "Arun Pillai" from "Dr. Arun
 * Pillai". A name that is only a title stays as it is.
 */
export function withoutTitle(name: string | null | undefined): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const at = words.findIndex((w) => !isNameTitle(w));
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
    return words.find((w) => !isNameTitle(w)) ?? words.at(0) ?? "";
}
