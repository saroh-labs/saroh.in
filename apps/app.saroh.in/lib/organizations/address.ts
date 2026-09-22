/**
 * The address a business name becomes, the way the API derives it
 * (`apps/api.saroh.in/src/modules/organizations/slug.ts`), so setup can show
 * the `<address>.saroh.app` a name will reserve as the merchant types it.
 *
 * A preview, not the authority: the API re-derives and checks it on create,
 * and the live availability check asks it directly. Kept in step with the
 * server by the test beside this file, which pins the same cases.
 */
export function addressFromName(name: string): string {
    const collapsed = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "-");
    let start = 0;
    let end = collapsed.length;
    while (start < end && collapsed[start] === "-") start++;
    while (end > start && collapsed[end - 1] === "-") end--;
    return collapsed.slice(start, end).slice(0, 63);
}

/**
 * What someone can type into the address field: lowercase letters, digits
 * and hyphens, as they type. Anything else is dropped rather than refused, so
 * "Rye Co" typed straight in reads "ryeco" instead of an error per keystroke.
 */
export function cleanAddressInput(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 63);
}
