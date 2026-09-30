/**
 * The longest address a business can claim (DEC-071): a DNS label's 63,
 * less the 6 of `test--`, so every address also works as its test host.
 * The API's `MAX_ADDRESS_LENGTH` (sites/site-address.ts) is the authority.
 */
export const MAX_ADDRESS_LENGTH = 57;

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
    let address = collapsed.slice(start, end).slice(0, MAX_ADDRESS_LENGTH);
    while (address.endsWith("-")) address = address.slice(0, -1);
    return address;
}

/**
 * What someone can type into the address field: lowercase letters, digits
 * and hyphens, as they type. Anything else is dropped rather than refused, so
 * "Rye Co" typed straight in reads "ryeco" instead of an error per keystroke.
 * Two hyphens in a row become one: an address can never have `--`
 * (DEC-071), so the preview never shows one the API would refuse.
 */
export function cleanAddressInput(value: string): string {
    return value
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, MAX_ADDRESS_LENGTH);
}
