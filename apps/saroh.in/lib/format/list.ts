/** "a", "a and b", "a, b and c" (DEC-195, B5). */
export function sentenceList(items: readonly string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
