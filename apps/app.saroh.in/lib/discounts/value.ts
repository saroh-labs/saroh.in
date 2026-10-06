/**
 * What is wrong with a code's percentage or amount off, in the words the
 * form shows under the field — or null when the API will take it. The same
 * rules as the API's (`discounts/dto.ts` and the service): an empty or
 * malformed value there comes back as a bare "Validation failed", which
 * could only be a toast.
 */
export function percentProblem(value: string): string | null {
    const v = value.trim();
    if (v === "") return "Enter how much it takes off";
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) {
        return "A number, with at most two decimal places";
    }
    const n = Number(v);
    if (n <= 0 || n > 100) return "More than 0 and at most 100";
    return null;
}

export function amountProblem(value: string): string | null {
    const v = value.trim();
    if (v === "") return "Enter how much it takes off";
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) {
        return "A number, with at most two decimal places";
    }
    if (Number(v) <= 0) return "More than 0";
    return null;
}
