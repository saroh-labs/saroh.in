/**
 * Custom fields (#482): the types a field can be and what each accepts.
 * Pure; tested in `field-rules.spec.ts`. A value is stored as text in the
 * one shape its type allows, so the shop and the editor read it the same.
 */

export const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "YES_NO"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_NAME_MAX = 40;
export const FIELD_TEXT_MAX = 200;

/** How long a deleted field keeps its values before they may be purged. */
export const FIELD_KEEP_DAYS = 30;

export type FieldValueCheck =
    { ok: true; value: string | null } | { ok: false; error: string };

/**
 * A typed value, cleaned: "" or null clears it; a number is a number; a
 * date is a real calendar day as YYYY-MM-DD; yes / no is "true" or "false".
 */
export function checkFieldValue(
    type: FieldType,
    name: string,
    raw: string | null | undefined,
): FieldValueCheck {
    const v = (raw ?? "").trim();
    if (v === "") return { ok: true, value: null };
    switch (type) {
        case "NUMBER":
            return /^-?\d+(\.\d+)?$/.test(v)
                ? { ok: true, value: v }
                : { ok: false, error: `${name} is a number.` };
        case "DATE": {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
            const d = m ? new Date(`${v}T00:00:00Z`) : null;
            const real =
                m &&
                d &&
                !Number.isNaN(d.getTime()) &&
                d.getUTCFullYear() === Number(m[1]) &&
                d.getUTCMonth() + 1 === Number(m[2]) &&
                d.getUTCDate() === Number(m[3]);
            return real
                ? { ok: true, value: v }
                : { ok: false, error: `${name} is a date, like 2026-09-24.` };
        }
        case "YES_NO":
            return v === "true" || v === "false"
                ? { ok: true, value: v }
                : { ok: false, error: `${name} is yes or no.` };
        default:
            return v.length > FIELD_TEXT_MAX
                ? {
                      ok: false,
                      error: `Keep ${name} under ${FIELD_TEXT_MAX} characters.`,
                  }
                : { ok: true, value: v };
    }
}

/** "There is already a field called …" — names are unique ignoring case. */
export function fieldNameProblem(name: string, others: string[]): string {
    const n = name.trim();
    if (!n) return "A field needs a name.";
    if (n.length > FIELD_NAME_MAX)
        return `Keep it under ${FIELD_NAME_MAX} characters.`;
    if (others.some((o) => o.toLowerCase() === n.toLowerCase()))
        return `There is already a field called ${n}.`;
    return "";
}
