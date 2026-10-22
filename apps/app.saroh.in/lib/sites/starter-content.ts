import type { LookId } from "@saroh/block-contract";
import { sampleContext } from "@saroh/site-blocks/showcase";
import {
    instantiateTemplate,
    lookShowcaseTemplate,
    starterCopyPlan,
} from "@saroh/templates";

import { formatDateTime } from "@/lib/format/datetime";
import type {
    DetailsFill,
    DraftVersion,
    FilledKind,
    SitePage,
    StarterContentCopy,
} from "@/lib/sites/service";

/**
 * "Use this look with its starter content" (DEC-182), in words: what the
 * confirm in a look's Preview says it will do, and what the toast says it
 * did. Pure, so the sentences are tested on their own.
 */

/** What copying a look's showcase template would do to this site. */
export interface StarterPlanView {
    /** The showcase template's name: "Gym". */
    templateName: string;
    /** The titles of the site's pages whose drafts it replaces. */
    replace: string[];
    /** The titles of the pages it adds. */
    create: string[];
}

/**
 * The plan the API will follow (`starterCopyPlan`), worked out from the
 * template drawn for its sample business. The API instantiates it for
 * this business, so a page that depends on a module can differ: the toast
 * says what was done.
 */
export function starterPlanFor(
    look: LookId | null,
    pages: readonly Pick<
        SitePage,
        "id" | "path" | "title" | "isHome" | "kind"
    >[],
): StarterPlanView {
    const template = lookShowcaseTemplate(look);
    const made = instantiateTemplate(template, sampleContext(template));
    const plan = starterCopyPlan(made.pages, pages);
    return {
        templateName: template.name,
        replace: plan.replace.map((r) => r.title),
        create: plan.create.map((c) => c.title),
    };
}

/** "Home", "Home and About", "Home, About and Classes". */
export function listOf(titles: readonly string[]): string {
    if (titles.length <= 1) return titles[0] ?? "";
    return `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
}

/** The confirm's one paragraph: what changes, and what stays. */
export function starterConfirmText(plan: StarterPlanView): string {
    const parts: string[] = [];
    if (plan.replace.length > 0) {
        parts.push(
            `Your draft of ${listOf(plan.replace)} is replaced with the ${plan.templateName} template's.`,
        );
    }
    if (plan.create.length > 0) {
        parts.push(
            plan.create.length === 1
                ? `${listOf(plan.create)} is added as a new page.`
                : `${listOf(plan.create)} are added as new pages.`,
        );
    }
    parts.push("Your other pages stay as they are.");
    return parts.join(" ");
}

/**
 * The confirm's second line: the words are a sample business's, and the
 * check before publishing names any left.
 */
export const STARTER_SAMPLE_NOTE =
    "Its words, prices and hours are a sample business's. Before you publish, we list any still on your pages. Nothing goes live until then.";

/** The confirm's choice, on by default (DEC-182, amended 22 Oct 2026). */
export const STARTER_FILL_LABEL = "Fill in my details";

/** Under the choice: what it fills, and that the rest stays a sample. */
export const STARTER_FILL_HINT =
    "Your staff, address and town go in where the sample has its own. The rest stays a sample to replace.";

/** Each kind of detail, as a sentence names it. */
const FILLED_WORDS: Record<FilledKind, string> = {
    team: "staff",
    address: "address",
    town: "town",
};

/** "your staff and address". */
function yourDetails(filled: readonly FilledKind[]): string {
    return `your ${listOf(filled.map((k) => FILLED_WORDS[k]))}`;
}

/** What the toast says after the copy. */
export function starterDoneMessage(copy: StarterContentCopy): {
    message: string;
    description?: string;
} {
    const pages = [...copy.replaced, ...copy.created];
    const filled =
        copy.filled.length > 0 ? ` Filled in ${yourDetails(copy.filled)}.` : "";
    return {
        message: "Starter content added to your draft.",
        description:
            pages.length > 0
                ? `Changed: ${listOf(pages)}.${filled} Replace the sample words with your own before you publish.`
                : undefined,
    };
}

/** "Bring in my details": the editor's action beside the looks. */
export const FILL_DETAILS_LABEL = "Bring in my details";

/** What the toast says after "Bring in my details". */
export function fillDoneMessage(fill: DetailsFill): {
    message: string;
    description?: string;
} {
    if (fill.snapshotId === null || fill.filled.length === 0) {
        return {
            message: "Nothing to bring in.",
            description:
                "No sample words on your pages have a detail of yours to replace them. Add your staff or address in Settings, then try again.",
        };
    }
    const brought = yourDetails(fill.filled);
    return {
        message: `Brought in ${brought}.`,
        description: `Changed: ${listOf(fill.pages)}.`,
    };
}

/** What each kind of change was, as a previous version names it. */
const BEFORE_WHAT: Record<string, string> = {
    "starter-content": "Before the starter content",
    "fill-details": "Before your details came in",
    rollback: "Before a roll back",
    "bring-in": "Before a section came in",
};

/** A previous version's line: "Before the starter content · Classic". */
export function versionTitle(version: DraftVersion, lookName: string): string {
    const what = BEFORE_WHAT[version.reason] ?? "An earlier draft";
    return `${what} · ${lookName}`;
}

/** When a version was replaced: "Today, 2:15 pm", "12 Oct, 9:30 am". */
export function versionWhen(
    version: DraftVersion,
    timeZone: string,
    now: Date = new Date(),
): string {
    return formatDateTime(version.createdAt, timeZone, { now, relative: true });
}

/** A section of a version, as the list names it: its heading, or its kind. */
export function versionSectionName(section: {
    type: string;
    heading: string | null;
}): string {
    if (section.heading) return section.heading;
    const kind = section.type.replace(/([A-Z])/g, " $1").toLowerCase();
    return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** The roll back's confirm. */
export const ROLLBACK_CONFIRM =
    "Your draft's pages, look and menu go back to how they were then. Your draft as it is now is kept here, so you can come back to it. Nothing goes live until you publish.";

/** What the toast says after a roll back. */
export const ROLLBACK_DONE = "Your draft is back to that version.";

/** What the toast says after a section is brought in. */
export function broughtInMessage(title: string): string {
    return `Added to the end of ${title || "your page"}.`;
}
