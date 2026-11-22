import type { PersonContent, PersonMember } from "./service";

/**
 * An Our team section's people as one list (round 3, EBTeamPicker): the
 * block's own person first, then `people`. The People list edits this
 * list; `withMembers` writes it back, the first one as the block's own.
 */
const MEMBER_KEYS = [
    "staffId",
    "image",
    "imageBrief",
    "name",
    "role",
    "bio",
] as const satisfies readonly (keyof PersonMember)[];

function pick(from: PersonMember | PersonContent): PersonMember {
    const out: PersonMember = { name: from.name };
    for (const k of MEMBER_KEYS) {
        if (from[k] !== undefined)
            (out as unknown as Record<string, unknown>)[k] = from[k];
    }
    return out;
}

export function membersOf(c: PersonContent): PersonMember[] {
    return [pick(c), ...(c.people ?? []).map(pick)];
}

/** The section with these people, in this order. Needs at least one. */
export function withMembers(
    c: PersonContent,
    members: PersonMember[],
): PersonContent {
    const [first, ...rest] = members as [PersonMember?, ...PersonMember[]];
    if (first === undefined) return c;
    const out = { ...c } as Record<string, unknown>;
    for (const k of MEMBER_KEYS) delete out[k];
    return {
        ...(out as Omit<PersonContent, keyof PersonMember>),
        ...pick(first),
        people: rest.length > 0 ? rest.map(pick) : undefined,
    };
}

/** A chosen team member, as the picker answers. */
export interface ChosenPerson {
    id: string;
    name: string;
    title: string | null;
}

/**
 * The people after the picker saved: those typed in by hand stay, a bound
 * person no longer chosen goes, those still chosen keep their place and
 * words, and the newly chosen join at the end with their Team title.
 * Null when nobody would be left (a person block needs a name).
 */
export function syncChosen(
    members: PersonMember[],
    chosen: ChosenPerson[],
): PersonMember[] | null {
    const ids = new Set(chosen.map((p) => p.id));
    const kept = members.filter((m) => !m.staffId || ids.has(m.staffId));
    const have = new Set(kept.map((m) => m.staffId).filter(Boolean));
    const added = chosen
        .filter((p) => !have.has(p.id))
        .map((p): PersonMember => ({
            staffId: p.id,
            name: p.name,
            ...(p.title ? { role: p.title } : {}),
        }));
    const out = [...kept, ...added];
    return out.length > 0 ? out : null;
}
