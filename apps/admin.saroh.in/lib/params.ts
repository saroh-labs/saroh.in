/** A query-string value, trimmed, or undefined when it says nothing. */
export function param(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
