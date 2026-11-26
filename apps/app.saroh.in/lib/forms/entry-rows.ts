import type { FormField, Submission } from "./service";

/** What a value reads as: a string as typed, anything else as JSON. */
export function show(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return JSON.stringify(value);
}

/** Who an entry came from: its contact, else the name or email typed. */
export function entryWho(submission: Submission): string {
    return (
        submission.contact?.name ??
        (show(submission.data.name) || show(submission.data.email) || "Someone")
    );
}

/**
 * The entry's rows, in the form's own order, then anything it carries that
 * the form no longer asks for (a field removed since) under its raw name —
 * what someone typed is never hidden because the form changed later. A value
 * that only repeats the name already heading the entry is left out.
 */
export function entryRows(
    submission: Submission,
    fields: FormField[],
    heading: string,
): { label: string; value: string; long: boolean }[] {
    const known = new Set(fields.map((f) => f.name));
    const out = fields.map((f) => ({
        label: f.label,
        value: show(submission.data[f.name]),
        long: f.type === "textarea",
    }));
    for (const [key, value] of Object.entries(submission.data)) {
        if (!known.has(key))
            out.push({ label: key, value: show(value), long: false });
    }
    return out.filter((r) => r.value !== "" && r.value !== heading);
}
