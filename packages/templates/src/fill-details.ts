import { GALLERY_SAMPLES } from "./gallery-samples";
import { isGallerySample } from "./sample-words";

/**
 * "Fill in my details" and "Bring in my details" (DEC-182, amended 22 Oct
 * 2026): a starter's sample words replaced with what the business has
 * already told Saroh. Pure: the API reads the facts and writes the result.
 *
 * Only text that is still a gallery sample's own words is replaced
 * (`isGallerySample`), so nothing the owner has typed is ever touched.
 * What the business hasn't said stays a sample, and the pre-publish check
 * still names it. The business's name, services, prices, hours and contact
 * are not here: the template already lays them down, or its blocks read
 * them live.
 *
 * What it fills:
 * - **team**: a Person block's sample people, in order, with the
 *   business's staff (their name, and what they do). The sample's lines
 *   about the sample person go with them; a sample person past the last
 *   member of staff stays.
 * - **address**: a sample's street address with the business's own.
 * - **town**: a fact under a place label ("Studio", "Where", "Based") with
 *   the business's town.
 * - **team** again: a fact under a people label ("Who", "Made by") with the
 *   staff's names.
 */

/** What the business has told Saroh that a starter's samples stand in for. */
export interface BusinessFacts {
    /** The staff, in order. */
    team: readonly { name: string; title?: string | null }[];
    /** The street address in one line. */
    address?: string;
    /** The town ("Bengaluru"). */
    town?: string;
}

/** What a fill replaced, as the toast names it. */
export type FilledKind = "team" | "address" | "town";

export interface FillResult {
    content: Record<string, unknown>;
    /** Each kind replaced at least once; empty when nothing changed. */
    filled: FilledKind[];
}

const PLACE_LABEL = /^(studio|where|based|location|town|city)$/i;
const PEOPLE_LABEL = /^(who|made by|run by|team|people)$/i;

/** Every sample's street address (`address`), folded for comparison. */
const SAMPLE_ADDRESSES = new Set(
    Object.values(GALLERY_SAMPLES).flatMap((s) => {
        const address = (s as { address?: unknown }).address;
        return typeof address === "string" ? [address.trim()] : [];
    }),
);

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, ">")
        .replace(/&lt;/g, "<")
        .replace(/&amp;/g, "&");
}

/** "Asha", "Asha and Ravi", "Asha, Ravi and Meena". */
function names(team: BusinessFacts["team"]): string {
    const all = team.map((t) => t.name);
    if (all.length <= 1) return all[0] ?? "";
    return `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
}

/** One person's fields with a member of staff in place of the sample's. */
function personAs(
    person: Record<string, unknown>,
    staff: BusinessFacts["team"][number],
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...person, name: staff.name };
    if (isGallerySample(person.role) || person.role === undefined) {
        if (staff.title) out.role = staff.title;
        else delete out.role;
    }
    if (isGallerySample(person.bio)) delete out.bio;
    return out;
}

function fillPerson(
    content: Record<string, unknown>,
    facts: BusinessFacts,
    filled: Set<FilledKind>,
): Record<string, unknown> {
    let next = 0;
    const take = (person: Record<string, unknown>) => {
        if (!isGallerySample(person.name)) return person;
        const staff = facts.team.at(next);
        if (!staff) return person;
        next += 1;
        filled.add("team");
        return personAs(person, staff);
    };
    const out = take(content);
    if (Array.isArray(content.people)) {
        out.people = content.people.map((p: unknown) =>
            p && typeof p === "object" ? take(p as Record<string, unknown>) : p,
        );
    }
    return out;
}

/** A fact list's values under place and people labels, in HTML. */
function fillFacts(
    html: string,
    facts: BusinessFacts,
    filled: Set<FilledKind>,
): string {
    return html.replace(
        /<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g,
        (whole, label: string, value: string) => {
            const text = unescapeHtml(value);
            if (!isGallerySample(text)) return whole;
            const term = unescapeHtml(label).trim();
            let into: string | undefined;
            if (PLACE_LABEL.test(term) && facts.town) {
                into = facts.town;
                filled.add("town");
            } else if (PEOPLE_LABEL.test(term) && facts.team.length > 0) {
                into = names(facts.team);
                filled.add("team");
            }
            return into === undefined
                ? whole
                : `<dt>${label}</dt><dd>${escapeHtml(into)}</dd>`;
        },
    );
}

/** Walk a value: sample addresses replaced, fact lists filled. */
function fillValue(
    value: unknown,
    facts: BusinessFacts,
    filled: Set<FilledKind>,
): unknown {
    if (typeof value === "string") {
        if (facts.address && SAMPLE_ADDRESSES.has(value.trim())) {
            filled.add("address");
            return facts.address;
        }
        return value.includes("<dt>") ? fillFacts(value, facts, filled) : value;
    }
    if (Array.isArray(value)) {
        return value.map((v) => fillValue(v, facts, filled));
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                k,
                fillValue(v, facts, filled),
            ]),
        );
    }
    return value;
}

/** One block's content with the business's details in place of samples. */
export function fillBusinessDetails(
    type: string,
    content: Record<string, unknown>,
    facts: BusinessFacts,
): FillResult {
    const filled = new Set<FilledKind>();
    let out = fillValue(content, facts, filled) as Record<string, unknown>;
    if (type === "person") out = fillPerson(out, facts, filled);
    return { content: out, filled: [...filled] };
}
