import { GST_STATES } from "./gst";

/**
 * A GSTIN, part by part, for the Tax card's guide under the field — the same
 * rules the API applies (`invoices/gst-states.ts` `gstinProblem`), said
 * piece by piece so someone typing one knows which part is short or wrong:
 *
 *   29  ABCDE1234F  1  Z  W
 *   │   │           │  │  └ check character, worked out from the other 14
 *   │   │           │  └── always Z
 *   │   │           └───── entity number (1–9, then A–Z)
 *   │   └───────────────── the business's PAN: 5 letters, 4 digits, a letter
 *   └───────────────────── state code
 */
export const GSTIN_EXAMPLE = "29ABCDE1234F1ZW";

export type GstinPartKey = "state" | "pan" | "entity" | "z" | "check";

export interface GstinPart {
    key: GstinPartKey;
    label: string;
    /** What goes here, in the example's characters. */
    example: string;
    /** What has been typed into this part so far. */
    typed: string;
    /** complete and right; still being typed; or wrong as typed. */
    state: "done" | "partial" | "empty" | "wrong";
}

const PARTS: {
    key: GstinPartKey;
    label: string;
    from: number;
    to: number;
    shape: RegExp;
}[] = [
    {
        key: "state",
        label: "State code",
        from: 0,
        to: 2,
        shape: /^[0-9]{0,2}$/,
    },
    {
        key: "pan",
        label: "PAN",
        from: 2,
        to: 12,
        shape: /^[A-Z]{0,5}$|^[A-Z]{5}[0-9]{0,4}$|^[A-Z]{5}[0-9]{4}[A-Z]?$/,
    },
    { key: "entity", label: "Entity", from: 12, to: 13, shape: /^[1-9A-Z]?$/ },
    { key: "z", label: "Always Z", from: 13, to: 14, shape: /^Z?$/ },
    { key: "check", label: "Check", from: 14, to: 15, shape: /^[0-9A-Z]?$/ },
];

const STATE_CODES = new Set<string>(GST_STATES.map((s) => s.value));
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The GSTIN's own check character, from its first fourteen (the API's). */
export function gstinCheckChar(first14: string): string {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return ALPHABET[(36 - (sum % 36)) % 36];
}

const clean = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** The five parts of what has been typed, each with how it stands. */
export function gstinParts(value: string): GstinPart[] {
    const g = clean(value);
    return PARTS.map((p) => {
        const typed = g.slice(p.from, p.to);
        const length = p.to - p.from;
        let state: GstinPart["state"] =
            typed === ""
                ? "empty"
                : !p.shape.test(typed)
                  ? "wrong"
                  : typed.length < length
                    ? "partial"
                    : "done";
        if (state === "done" && p.key === "state" && !STATE_CODES.has(typed)) {
            state = "wrong";
        }
        if (
            state === "done" &&
            p.key === "check" &&
            g.length === 15 &&
            gstinCheckChar(g.slice(0, 14)) !== typed
        ) {
            state = "wrong";
        }
        return {
            key: p.key,
            label: p.label,
            example: GSTIN_EXAMPLE.slice(p.from, p.to),
            typed,
            state,
        };
    });
}

const list = (words: string[]) =>
    words.length < 2
        ? (words[0] ?? "")
        : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

const MISSING: Record<GstinPartKey, string> = {
    state: "the state code",
    pan: "the PAN",
    entity: "the entity number",
    z: "the Z",
    check: "the check character",
};

/**
 * Why a GSTIN is refused, or null — the first thing wrong, in the words of
 * the part it is in. The API has the last word; this says it sooner.
 */
export function gstinProblem(value: string): string | null {
    const g = clean(value);
    if (g === "") {
        return `A GST-registered business needs its GSTIN here — 15 characters, like ${GSTIN_EXAMPLE}.`;
    }
    const parts = gstinParts(g);
    const wrong = parts.find((p) => p.state === "wrong");
    if (wrong) {
        switch (wrong.key) {
            case "state":
                return /^[0-9]{2}$/.test(wrong.typed)
                    ? `${wrong.typed} isn't a state code. A GSTIN starts with its state's two digits, like 29 for Karnataka.`
                    : "A GSTIN starts with two digits: the state code.";
            case "pan":
                return "Characters 3 to 12 are the PAN: 5 letters, 4 digits, then a letter, like ABCDE1234F.";
            case "entity":
                return "The 13th character is the entity number: 1 to 9, or a letter.";
            case "z":
                return "The 14th character of a GSTIN is always Z.";
            case "check":
                return g.length > 15
                    ? `That's ${g.length} characters — a GSTIN has 15.`
                    : "The last character doesn't match the rest — look for a mistyped character.";
        }
    }
    if (g.length > 15) return `That's ${g.length} characters — a GSTIN has 15.`;
    if (g.length < 15) {
        const missing = parts
            .filter((p) => p.state !== "done")
            .map((p) => MISSING[p.key]);
        return `${g.length} of 15 characters — add ${list(missing)}.`;
    }
    return null;
}
