import type {
    InstantiatedPage,
    InstantiatedSection,
    InstantiatedTemplate,
} from "./instantiate";
import { isOwnerNote } from "./placeholders";

/**
 * Bringing a site's pages up to what its template lays down now (starter
 * v4, DEC-141), without destroying anything its owner wrote.
 *
 * Two things use it, and they are the same question asked at different
 * times: the upgrade of an existing site to its template's newest version,
 * and a business switching a module on after its site exists. Each has
 * "what the template made then" and "what it makes now", and a draft that
 * may have been edited in between.
 *
 * The rule, per page:
 *
 * - **Untouched** — its sections are exactly what the template made (same
 *   blocks, same order, same content, none hidden): it becomes what the
 *   template makes now. Nobody wrote it, so nothing is lost.
 * - **Edited** — anything else: every section stays as it is, in its
 *   order. It gains only the template's BOUND sections it has nothing like
 *   ({@link BOUND_SECTION_TYPES}: a product grid, a services list, the
 *   place). Those show the business's own data and carry no words of the
 *   template's, so they cannot contradict what the owner wrote. A heading,
 *   a paragraph or a button of the template's is never added to a page
 *   somebody has edited.
 * - **A note to the owner** in a hero's line (`isOwnerNote`) is the one
 *   thing taken off an edited page: the owner did not write it, and it was
 *   never meant for a visitor. The business's own line takes its place, or
 *   nothing.
 * - **A page the template no longer makes**, still untouched: hidden, not
 *   deleted. It leaves the live site at the next publish and the owner can
 *   show it again.
 * - **A page the template newly makes**: added. A page it made before and
 *   the owner deleted is not brought back.
 *
 * "Edited" is decided from data, never guessed. A page is untouched when
 * either proof holds:
 *
 * 1. **Its draft has never been saved** (`revision` 0). Every save of a
 *    page's sections goes through one write, which counts it; a draft still
 *    at 0 holds exactly what made it. This is the proof that survives a
 *    business being renamed or adding a service since.
 * 2. **Its sections equal what the template produces for the business**
 *    (`made`, one candidate per plausible profile: the name as it is and as
 *    the site was named, with and without an email). A page saved without
 *    being changed is still the template's.
 *
 * A page that passes neither counts as edited, which is the safe direction:
 * an edited page keeps everything.
 *
 * Pure: no database. The API reads the site, calls this, and writes the
 * plan (`template-sync.ts`).
 */

/** A section as a site holds it. */
export interface StoredSection {
    type: string;
    contractVersion: number;
    content: unknown;
    hidden?: boolean;
    /** The section's stable key; kept through every plan that keeps it. */
    key?: string;
}

/** A page's draft as a site holds it. */
export interface StoredPage {
    path: string;
    isHome?: boolean;
    hidden?: boolean;
    /**
     * How many times the draft's sections have been saved since it was
     * made. Absent means not known, which is never read as "never".
     */
    revision?: number;
    sections: readonly StoredSection[];
}

/** A section a plan writes: one the page had (with its key), or a new one. */
export interface PlannedSection {
    type: string;
    contractVersion: number;
    content: unknown;
    hidden: boolean;
    /** Absent for a section the plan adds: the writer mints its key. */
    key?: string;
}

export type PagePlan =
    /** Leave the page exactly as it is. */
    | { path: string; action: "keep" }
    /** Untouched: its sections become the template's. */
    | { path: string; action: "replace"; sections: PlannedSection[] }
    /** Edited: its sections stay, with these additions. */
    | {
          path: string;
          action: "merge";
          sections: PlannedSection[];
          /** The types of the sections added, in order. */
          added: string[];
          /** Owner notes taken out of hero lines. */
          notesRemoved: number;
      }
    /** The template makes it now and the site never had it. */
    | { path: string; action: "create"; page: InstantiatedPage }
    /** Untouched, and the template no longer makes it. */
    | { path: string; action: "hide" };

/**
 * The blocks that show the business's own data, read live, and so may be
 * added to a page its owner has edited. In no order of their own: a plan
 * keeps the template's.
 */
export const BOUND_SECTION_TYPES = [
    "productGrid",
    "servicesList",
    "timetable",
    "plans",
    "packs",
    "visitUs",
    "hours",
] as const;

const BOUND = new Set<string>(BOUND_SECTION_TYPES);

/** The bound blocks that say where the business is. */
const PLACE = new Set<string>(["visitUs", "hours"]);

/**
 * What a bound block must not sit beside: a page that already says where
 * the business is (in any of three blocks) needs no second place, and one
 * with a booking widget already takes bookings.
 */
const CONFLICTS: Record<string, readonly string[]> = {
    productGrid: ["productGrid"],
    servicesList: ["servicesList", "booking"],
    timetable: ["timetable"],
    plans: ["plans"],
    packs: ["packs"],
    visitUs: ["visitUs", "hours", "contact"],
    hours: ["visitUs", "hours", "contact"],
};

/** Sections a page may end on: the place goes above them, not below. */
const CLOSING = new Set<string>(["cta", "enquiry"]);

/** JSON with its keys in order, so two equal objects are equal strings. */
function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(",")}}`;
    }
    // `JSON.stringify(undefined)` is not a string at all.
    return value === undefined ? "null" : JSON.stringify(value);
}

/**
 * A section's content as the template wrote it: without the Form the API
 * made for an enquiry section after the template laid it down.
 */
function asMade(section: { type: string; content: unknown }): unknown {
    if (
        section.type !== "enquiry" ||
        section.content === null ||
        typeof section.content !== "object"
    ) {
        return section.content;
    }
    const { formId: _formId, ...rest } = section.content as Record<
        string,
        unknown
    >;
    return rest;
}

/** Whether stored sections are exactly the ones a template made. */
export function sameAsMade(
    stored: readonly StoredSection[],
    made: readonly InstantiatedSection[],
): boolean {
    if (stored.length !== made.length) return false;
    return stored.every((section, index) => {
        // The two are the same length, so there is one at every index.
        const other = made[index];
        return (
            section.hidden !== true &&
            section.type === other.type &&
            section.contractVersion === other.contractVersion &&
            canonical(asMade(section)) === canonical(asMade(other))
        );
    });
}

/** Whether a stored page is what any of the candidates made at its path. */
export function pageUntouched(
    page: StoredPage,
    made: readonly InstantiatedTemplate[],
): boolean {
    return made.some((candidate) => {
        const original = candidate.pages.find((p) => p.path === page.path);
        return (
            original !== undefined &&
            sameAsMade(page.sections, original.sections)
        );
    });
}

function kept(section: StoredSection): PlannedSection {
    return {
        type: section.type,
        contractVersion: section.contractVersion,
        content: section.content,
        hidden: section.hidden === true,
        ...(section.key ? { key: section.key } : {}),
    };
}

/**
 * The template's sections for an untouched page. A section that is the same
 * block in the same place among its kind keeps its key, so a note pinned to
 * the hero stays on the hero; and an enquiry form keeps the Form behind it,
 * so the messages it has taken stay with the form the page still shows.
 */
function replaced(
    stored: readonly StoredSection[],
    next: readonly InstantiatedSection[],
): PlannedSection[] {
    const byType = new Map<string, StoredSection[]>();
    for (const section of stored) {
        const same = byType.get(section.type) ?? [];
        same.push(section);
        byType.set(section.type, same);
    }
    return next.map((section) => {
        const before = byType.get(section.type)?.shift();
        const formId =
            section.type === "enquiry" &&
            before?.content !== null &&
            typeof before?.content === "object"
                ? (before.content as { formId?: unknown }).formId
                : undefined;
        return {
            type: section.type,
            contractVersion: section.contractVersion,
            content:
                typeof formId === "string" && formId !== ""
                    ? { ...(section.content as object), formId }
                    : section.content,
            hidden: false,
            ...(before?.key ? { key: before.key } : {}),
        };
    });
}

/** A hero whose line is a note to the owner, with the note gone. */
function withoutOwnerNote(
    section: PlannedSection,
    line: string | undefined,
): PlannedSection | null {
    if (section.type !== "hero") return null;
    if (section.content === null || typeof section.content !== "object") {
        return null;
    }
    const content = section.content as Record<string, unknown>;
    if (!isOwnerNote(content.subheading)) return null;
    const { subheading: _note, ...rest } = content;
    return {
        ...section,
        content: line ? { ...rest, subheading: line } : rest,
    };
}

/**
 * Whether a section is one a page ends on: a button, a form, or a text
 * block on the accent band (the starter's own closing band).
 */
function closes(section: PlannedSection): boolean {
    if (CLOSING.has(section.type)) return true;
    return (
        section.type === "richText" &&
        section.content !== null &&
        typeof section.content === "object" &&
        (section.content as { band?: unknown }).band === "accent"
    );
}

/**
 * An edited page's sections with the template's bound sections it lacks.
 *
 * - **What the business offers** (products, services, classes, plans,
 *   packs) goes where the template has it, relative to what the page
 *   holds: after the nearest section before it in the template that the
 *   page also has. A product grid lands after the hero; a services list
 *   after the product grid, when there is one.
 * - **The place** goes at the foot: above the section the page ends on (a
 *   button, a form, a closing band), else last. Never up among the owner's
 *   own words.
 * - With nothing to follow, an offer goes to the foot too.
 */
export function withBoundSections(
    stored: readonly StoredSection[],
    next: readonly InstantiatedSection[],
): { sections: PlannedSection[]; added: string[] } {
    const sections = stored.map(kept);
    const added: string[] = [];
    next.forEach((wanted, index) => {
        if (!BOUND.has(wanted.type)) return;
        const conflicts = CONFLICTS[wanted.type] ?? [wanted.type];
        if (sections.some((s) => conflicts.includes(s.type))) return;

        let at = -1;
        if (!PLACE.has(wanted.type)) {
            for (let i = index - 1; i >= 0 && at === -1; i--) {
                at = sections.map((s) => s.type).lastIndexOf(next[i].type);
            }
        }
        const foot = sections.length - 1;
        const position =
            at !== -1
                ? at + 1
                : foot >= 0 && closes(sections[foot])
                  ? foot
                  : sections.length;
        sections.splice(position, 0, {
            type: wanted.type,
            contractVersion: wanted.contractVersion,
            content: wanted.content,
            hidden: false,
        });
        added.push(wanted.type);
    });
    return { sections, added };
}

export interface TemplateUpgradeInput {
    /** The site's free-form pages, as its draft holds them. */
    stored: readonly StoredPage[];
    /**
     * What the template could have made these pages as: one instantiation
     * per plausible business profile (the name as it is and as the site was
     * named, with and without an email).
     */
    made: readonly InstantiatedTemplate[];
    /** What the template makes for the business now. */
    next: InstantiatedTemplate;
    /** The business's own line, to stand where an owner note was. */
    line?: string;
}

/**
 * The plan for every page, the template's first and then the site's own.
 * Running it again over its own result plans nothing but `keep`.
 */
export function planTemplateUpgrade(input: TemplateUpgradeInput): PagePlan[] {
    const { stored, made, next, line } = input;
    const plans: PagePlan[] = [];
    const byPath = new Map(stored.map((page) => [page.path, page]));
    const untouched = (page: StoredPage) =>
        page.revision === 0 || pageUntouched(page, made);

    const edited = (page: StoredPage, target?: InstantiatedPage): PagePlan => {
        const merged = target
            ? withBoundSections(page.sections, target.sections)
            : { sections: page.sections.map(kept), added: [] as string[] };
        let notesRemoved = 0;
        const sections = merged.sections.map((section) => {
            const cleared = withoutOwnerNote(section, line);
            if (!cleared) return section;
            notesRemoved++;
            return cleared;
        });
        return merged.added.length === 0 && notesRemoved === 0
            ? { path: page.path, action: "keep" }
            : {
                  path: page.path,
                  action: "merge",
                  sections,
                  added: merged.added,
                  notesRemoved,
              };
    };

    for (const target of next.pages) {
        const page = byPath.get(target.path);
        if (!page) {
            // Made before and gone now: the owner deleted it. Not made
            // before: it is new, so the site gets it.
            const madeBefore = made.some((candidate) =>
                candidate.pages.some((p) => p.path === target.path),
            );
            if (!madeBefore) {
                plans.push({
                    path: target.path,
                    action: "create",
                    page: target,
                });
            }
            continue;
        }
        // A page its owner hid is parked work: left alone.
        if (page.hidden === true) {
            plans.push({ path: page.path, action: "keep" });
            continue;
        }
        if (sameAsMade(page.sections, target.sections)) {
            plans.push({ path: page.path, action: "keep" });
            continue;
        }
        if (untouched(page)) {
            plans.push({
                path: page.path,
                action: "replace",
                sections: replaced(page.sections, target.sections),
            });
            continue;
        }
        plans.push(edited(page, target));
    }

    const targeted = new Set(next.pages.map((p) => p.path));
    for (const page of stored) {
        if (targeted.has(page.path)) continue;
        // Only a page the template itself made is hidden: a page the owner
        // added and has not filled in yet is theirs.
        const templates = made.some((candidate) =>
            candidate.pages.some((p) => p.path === page.path),
        );
        if (
            templates &&
            page.hidden !== true &&
            page.isHome !== true &&
            untouched(page)
        ) {
            plans.push({ path: page.path, action: "hide" });
            continue;
        }
        plans.push(
            page.hidden === true
                ? { path: page.path, action: "keep" }
                : edited(page),
        );
    }
    return plans;
}
