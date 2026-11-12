import type { TemplateBusiness } from "@saroh/site-blocks/showcase";

import { plural } from "@/lib/format/plural";
import { listWords } from "@/lib/modules/switch-plan";
import type { Template } from "@/lib/sites/service";
import type { ModuleStates } from "@/lib/sites/template-picker";
import { offReason } from "@/lib/sites/template-picker";

/**
 * A template's preview (DEC-216, board D4), in words: what of the business
 * goes into the site, what stays a sample to replace, and what waits on a
 * module. Pure, so the sentences are tested on their own.
 */

/** The business's own details as `GET …/template-preview` sends them. */
export type TemplatePreviewDetails = TemplateBusiness;

/**
 * The read checked for the fields the preview draws, not cast into them:
 * anything else is "couldn't be read", and the sample is drawn instead.
 */
export function previewDetailsOf(raw: unknown): TemplatePreviewDetails | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const context = r.context as Record<string, unknown> | undefined;
    const facts = r.facts as Record<string, unknown> | undefined;
    if (
        typeof context?.organizationName !== "string" ||
        !Array.isArray(r.services) ||
        !Array.isArray(facts?.team)
    ) {
        return null;
    }
    return raw as TemplatePreviewDetails;
}

/** One line of "What goes in": the thing, and where it comes from. */
export interface GoesInLine {
    what: string;
    from: string;
}

export interface WhatGoesIn {
    /** "From Meher Hair Studio". */
    yours: GoesInLine[];
    /** "A sample to replace". */
    sample: GoesInLine[];
    /** "Waits on a module": why, or that nothing does. */
    waits: string;
}

/** Whether a template's sections list the business's services. */
const listsServices = (template: Pick<Template, "uses">) =>
    (template.uses ?? []).includes("APPOINTMENTS");

/** The team as a line names it: "Farah and Imran", "Farah, Imran and 2 more". */
function teamWords(team: TemplatePreviewDetails["facts"]["team"]): string {
    const names = team.map((p) => p.name);
    if (names.length <= 3) return listWords(names);
    return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/**
 * "What goes in" beside a template's preview (board D4): from the business
 * what it has told Saroh, as a site made from it now would draw it; the
 * template's own words and photos as a sample to replace; and the modules
 * it waits on. With no details (not read), only the sample is said.
 */
export function whatGoesIn(
    template: Pick<Template, "name" | "uses">,
    details: TemplatePreviewDetails | null,
    modules: ModuleStates | null,
    sampleName: string,
): WhatGoesIn {
    const yours: GoesInLine[] = [];
    const sample: GoesInLine[] = [
        {
            what: "The headline and the line under it",
            from: `${sampleName}'s words`,
        },
    ];
    const services = details?.services.length ?? 0;
    if (details) {
        yours.push({ what: "Name", from: "Settings › Business" });
        if (listsServices(template) && services > 0) {
            yours.push({
                what: `${services} ${plural(services, "service")} with prices and times`,
                from: "Bookings, live: change a price there and the site follows",
            });
        }
        const visit = details.visit;
        const place =
            visit?.hours && visit.address
                ? "Hours and address"
                : visit?.hours
                  ? "Hours"
                  : visit?.address
                    ? "Address"
                    : null;
        if (place) yours.push({ what: place, from: "Settings › Business" });
        if (details.facts.team.length > 0) {
            yours.push({
                what: `${teamWords(details.facts.team)}, who do the work`,
                from: "Team",
            });
        }
    }
    if (listsServices(template) && services === 0) {
        sample.push({
            what: "Services and prices",
            from: `${sampleName}'s, until you add yours in Bookings`,
        });
    }
    sample.push({
        what: "Photos",
        from: "Drawn as shapes until you add yours",
    });
    return {
        yours,
        sample,
        waits:
            offReason(template, modules) ??
            `Nothing. Everything ${template.name} uses is on.`,
    };
}

/**
 * The chosen template's one line once the sheet collapses (board D5):
 * "Kesar colourway · your details go in: name, 6 services, hours, team".
 */
export function chosenLine(
    template: Pick<Template, "uses">,
    colourway: string | null,
    details: TemplatePreviewDetails | null,
): string {
    const parts: string[] = [];
    if (colourway) parts.push(`${colourway} colourway`);
    if (details) {
        const services = details.services.length;
        const goes = [
            "name",
            ...(listsServices(template) && services > 0
                ? [`${services} ${plural(services, "service")}`]
                : []),
            ...(details.visit?.hours ? ["hours"] : []),
            ...(details.facts.team.length > 0 ? ["team"] : []),
        ];
        parts.push(`your details go in: ${goes.join(", ")}`);
    }
    return parts.join(" · ");
}
