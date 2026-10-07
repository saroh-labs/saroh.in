/**
 * What the import's mapping step calls a field (UX-065): the API's label
 * ("First name", "Web address"), or — from an API that predates labels —
 * the key in words ("zipCode" → "Zip code"), never the raw key.
 */
export function fieldLabel(
    labels: Readonly<Record<string, string>> | undefined,
    field: string,
): string {
    const given = labels?.[field];
    if (given) return given;
    const words = field
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim()
        .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}
