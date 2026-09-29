/**
 * What a service card calls the person who takes it: their first name,
 * "With Karan, Ritu" — unless the name starts with a title, when the title
 * and surname are what the business calls them: "With Dr. Pillai, Dr. Rao".
 * A bare first word there read "With Dr., Dr." on Kavi Dental's cards.
 */
const TITLES = new Set(["dr", "prof", "mr", "mrs", "ms", "mx", "sri", "smt"]);

export function callName(fullName: string): string {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    const [first = "", ...rest] = words;
    if (rest.length > 0 && TITLES.has(first.replace(/\.$/, "").toLowerCase())) {
        return `${first} ${rest.at(-1)}`;
    }
    return first;
}
