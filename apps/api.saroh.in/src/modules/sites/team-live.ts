import { prisma } from "@saroh/database";

import type { MediaService } from "../media/media.service";
import { teamPageWhere } from "./page-starters";

/**
 * Our team, read live (round 3, EBTeamPicker; DEC text in the round-3
 * report). An Our team section's people may be bound to team members
 * (`staffId`), picked by an owner or admin. On every public read a bound
 * person shows only while still chosen (`showOnTeamPage`) and active, under
 * their name as Team has it now, so someone taken off goes from the live
 * site at once, without a publish. A person typed in by hand (no
 * `staffId`) is drawn as typed, so a published page with none is returned
 * untouched, the same object.
 */

/** The person fields that move when the block's own person is taken off. */
const MEMBER_KEYS = [
    "staffId",
    "image",
    "imageBrief",
    "name",
    "role",
    "bio",
] as const;

type Obj = Record<string, unknown>;

/** What a chosen person's profile says now. */
export interface LivePerson {
    name: string;
    /** Their photo as a section's image, or none: initials show. */
    image?: Obj;
    about?: string;
}

const isObj = (v: unknown): v is Obj =>
    v !== null && typeof v === "object" && !Array.isArray(v);

function pagesOf(snapshot: unknown): Obj[] {
    const pages = isObj(snapshot) ? snapshot.pages : null;
    return Array.isArray(pages) ? pages.filter(isObj) : [];
}

function sectionsOf(page: Obj): unknown[] {
    return Array.isArray(page.sections) ? page.sections : [];
}

function membersOf(content: Obj): Obj[] {
    const people = Array.isArray(content.people)
        ? content.people.filter(isObj)
        : [];
    return [content, ...people];
}

const staffIdOf = (m: Obj): string | null =>
    typeof m.staffId === "string" && m.staffId !== "" ? m.staffId : null;

/** Every team member a snapshot's person sections name. */
export function boundStaffIds(snapshot: unknown): Set<string> {
    const ids = new Set<string>();
    for (const page of pagesOf(snapshot)) {
        for (const s of sectionsOf(page)) {
            if (!isObj(s) || s.type !== "person" || !isObj(s.content)) {
                continue;
            }
            for (const m of membersOf(s.content)) {
                const id = staffIdOf(m);
                if (id) ids.add(id);
            }
        }
    }
    return ids;
}

/**
 * One person section with only the chosen people (pure). Null when nobody
 * is left to show: the section goes, since a person block needs a name.
 */
export function liveTeamSection(
    content: Obj,
    chosen: ReadonlyMap<string, LivePerson>,
): Obj | null {
    const kept: Obj[] = [];
    for (const m of membersOf(content)) {
        const id = staffIdOf(m);
        if (!id) {
            kept.push(m);
            continue;
        }
        const live = chosen.get(id);
        if (!live) continue;
        // The profile's photo and words, never the page's own copies.
        const { image: _image, imageBrief: _brief, bio: _bio, ...rest } = m;
        kept.push({
            ...rest,
            name: live.name,
            ...(live.image ? { image: live.image } : {}),
            ...(live.about ? { bio: live.about } : {}),
        });
    }
    const first = kept.shift();
    if (first === undefined) return null;
    const rest = kept;
    const out: Obj = { ...content };
    for (const k of MEMBER_KEYS) delete out[k];
    for (const k of MEMBER_KEYS) if (first[k] !== undefined) out[k] = first[k];
    const others = rest.map((m) => {
        const member: Obj = {};
        for (const k of MEMBER_KEYS) if (m[k] !== undefined) member[k] = m[k];
        return member;
    });
    if (others.length > 0) out.people = others;
    else delete out.people;
    return out;
}

/**
 * The snapshot with every bound person checked against `chosen` (pure).
 * A section left with nobody is dropped, with its key, so the snapshot's
 * per-path section keys still line up.
 */
export function withLiveTeam(
    snapshot: unknown,
    chosen: ReadonlyMap<string, LivePerson>,
): unknown {
    if (!isObj(snapshot) || !Array.isArray(snapshot.pages)) return snapshot;
    const keys = isObj(snapshot.keys) ? { ...snapshot.keys } : null;
    const pages = (snapshot.pages as unknown[]).map((raw) => {
        if (!isObj(raw) || !Array.isArray(raw.sections)) return raw;
        const ownKeys =
            keys && typeof raw.path === "string" && isObj(keys[raw.path])
                ? (keys[raw.path] as Obj)
                : null;
        const sectionKeys =
            ownKeys &&
            Array.isArray(ownKeys.sections) &&
            ownKeys.sections.length === raw.sections.length
                ? ownKeys.sections
                : null;
        const sections: unknown[] = [];
        const kept: unknown[] = [];
        raw.sections.forEach((s, i) => {
            if (
                !isObj(s) ||
                s.type !== "person" ||
                !isObj(s.content) ||
                !membersOf(s.content).some((m) => staffIdOf(m))
            ) {
                sections.push(s);
                kept.push(sectionKeys?.[i]);
                return;
            }
            const content = liveTeamSection(s.content, chosen);
            if (!content) return;
            sections.push({ ...s, content });
            kept.push(sectionKeys?.[i]);
        });
        if (sections.length === raw.sections.length) {
            // Same count: only names or people changed inside.
            return { ...raw, sections };
        }
        if (keys && sectionKeys && typeof raw.path === "string") {
            keys[raw.path] = { ...ownKeys, sections: kept };
        }
        return { ...raw, sections };
    });
    return { ...snapshot, pages, ...(keys ? { keys } : {}) };
}

/**
 * A publication's snapshot as the public sees it now. One read, and only
 * when some person section names a team member; otherwise the snapshot
 * itself, untouched.
 */
export async function liveTeamSnapshot(
    snapshot: unknown,
    organizationId: string,
    media?: MediaService,
): Promise<unknown> {
    const ids = boundStaffIds(snapshot);
    if (ids.size === 0) return snapshot;
    const rows = await prisma.staffMember.findMany({
        where: { ...teamPageWhere(organizationId), id: { in: [...ids] } },
        select: { id: true, name: true, about: true, photoMediaId: true },
    });
    const people = await Promise.all(
        rows.map(async (r): Promise<[string, LivePerson]> => [
            r.id,
            {
                name: r.name,
                ...(r.about ? { about: r.about } : {}),
                ...(r.photoMediaId && media
                    ? await photoOf(
                          media,
                          organizationId,
                          r.photoMediaId,
                          r.name,
                      )
                    : {}),
            },
        ]),
    );
    return withLiveTeam(snapshot, new Map(people));
}

/** A profile photo as a section's image; nothing when it can't be served. */
async function photoOf(
    media: MediaService,
    organizationId: string,
    mediaId: string,
    name: string,
): Promise<{ image?: Obj }> {
    try {
        const m = await media.readyObject(organizationId, mediaId);
        if (!m.url) return {};
        return {
            image: {
                src: m.url,
                alt: name,
                ...(m.width && m.height
                    ? { width: m.width, height: m.height }
                    : {}),
                ...(m.placeholder ? { placeholder: m.placeholder } : {}),
                ...(m.widths.length > 0 ? { widths: m.widths } : {}),
            },
        };
    } catch {
        return {};
    }
}
