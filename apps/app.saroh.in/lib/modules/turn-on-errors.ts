/**
 * The field errors a refused turn-on carries (DEC-068): a 400 names each
 * field of `setup` it is about, and the sheet puts the words beside that
 * field (`frontend-forms.md`). The API's exception filter forwards them as
 * `error.details`; this reads every shape it may take there, so the sheet
 * doesn't depend on which one M1 settles on:
 *
 * - `{ field: "setup.address" }` with the message beside it,
 * - `{ fields: { "setup.address": "…" } }` or `{ fields: [{ path, message }] }`,
 * - class-validator's array of sentences ("setup.address must be …"),
 * - an array of `{ path | field | property, message | constraints }`.
 *
 * Paths come back without the `setup.` prefix and with `[n]` as `.n`:
 * `hours.2.open`, `service.price`, `address`.
 */
export type FieldErrors = Record<string, string>;

/** "setup.hours[2].open" → "hours.2.open". */
export function normalisePath(path: string): string {
    return path
        .trim()
        .replace(/\[(\d+)\]/g, ".$1")
        .replace(/^setup\./, "")
        .replace(/^\./, "");
}

function add(out: FieldErrors, path: unknown, message: unknown) {
    if (typeof path !== "string" || !path.trim()) return;
    const said =
        typeof message === "string" && message.trim()
            ? message.trim()
            : Array.isArray(message) && typeof message[0] === "string"
              ? message[0]
              : message && typeof message === "object"
                ? Object.values(message).find((v) => typeof v === "string")
                : undefined;
    if (typeof said !== "string") return;
    const key = normalisePath(path);
    if (key && !(key in out)) out[key] = said;
}

/** "setup.address must be lowercase" → ["setup.address", the sentence]. */
function fromSentence(out: FieldErrors, sentence: string) {
    const match = /^([A-Za-z_][\w.[\]]*)\s+(.+)$/.exec(sentence.trim());
    if (!match?.[1]?.includes(".") && !match?.[1]?.startsWith("setup")) {
        return;
    }
    add(out, match[1], sentence.trim());
}

function fromItems(out: FieldErrors, items: unknown[]) {
    for (const item of items) {
        if (typeof item === "string") fromSentence(out, item);
        else if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            add(
                out,
                o.path ?? o.field ?? o.property,
                o.message ?? o.messages ?? o.constraints,
            );
        }
    }
}

/** Read the field errors out of a refused write's body. */
export function fieldErrorsOf(body: unknown): FieldErrors {
    const out: FieldErrors = {};
    const b = (body ?? {}) as Record<string, unknown>;
    const inner =
        b.error && typeof b.error === "object"
            ? (b.error as Record<string, unknown>)
            : b;
    const message = inner.message;
    const details = inner.details ?? b.details;
    if (Array.isArray(details)) {
        fromItems(out, details);
    } else if (details && typeof details === "object") {
        const d = details as Record<string, unknown>;
        if (typeof d.field === "string")
            add(out, d.field, d.message ?? message);
        if (Array.isArray(d.fields)) fromItems(out, d.fields);
        else if (d.fields && typeof d.fields === "object") {
            for (const [path, said] of Object.entries(d.fields)) {
                add(out, path, said);
            }
        }
        if (Array.isArray(d.errors)) fromItems(out, d.errors);
    }
    if (Array.isArray(inner.message)) fromItems(out, inner.message);
    return out;
}
