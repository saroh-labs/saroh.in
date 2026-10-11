import { firstRunJobs } from "@/lib/home/first-run";
import { INVOICE_JOB } from "@/lib/organizations/kind";

import { GOAL_LATER, goalHref, isGoalKey } from "./goals";
import { moduleName } from "./names";
import type { ModuleView } from "./schema";
import { draftFrom, problemsOf, setupFor, turnOnPlan } from "./turn-on";
import type { SetupDefaults } from "./turn-on-schema";
import type { EnableResult } from "./turn-on-service";

/**
 * Setup's "Create" (UX audit, 10 Oct): turn the chosen goal on with its
 * defaults and say where to land, with no second sheet of questions.
 *
 * Every default exists by the time the business does. Sell's location is
 * named after the business and collects in person. The website is named
 * after it too, at the web address just chosen. Contacts needs nothing.
 * Bookings turns on with nothing made, because its first service is the
 * page the merchant lands on, and that page is where its hours are set.
 *
 * It lands on the thing itself: a new product, a new service, the site with
 * Publish, Contacts with New contact open. When the goal can't be turned on
 * (Saroh hasn't offered it to this business yet, or the API refused), the
 * business is still set up: it lands on Home, which offers what there is,
 * and says why in one sentence.
 *
 * Pure but for what it is handed, so each goal's path is tested without a
 * server.
 */
export interface FirstGoalDeps {
    listModules(): Promise<ModuleView[]>;
    getSetupDefaults(key: string): Promise<SetupDefaults>;
    enableModule(key: string, setup: object | undefined): Promise<EnableResult>;
}

export interface FirstGoalOutcome {
    /** Where setup lands. */
    href: string;
    /** Said once on arrival when the goal did not turn on. */
    said?: string;
    /** The modules that were turned on, in order. */
    turnedOn: string[];
}

const HOME = "/";

/** Modules a first run turns on with nothing made, and why. */
const NO_SETUP: ReadonlySet<string> = new Set([
    // Its minimum is a first service, which is the page they land on.
    "APPOINTMENTS",
]);

export async function startWithGoal(
    deps: FirstGoalDeps,
    goal: string,
    kind?: unknown,
): Promise<FirstGoalOutcome> {
    if (goal === GOAL_LATER || !isGoalKey(goal)) {
        return { href: HOME, turnedOn: [] };
    }
    // Invoicing needs no module (DEC-070): straight to a new invoice.
    if (goal === INVOICE_JOB) {
        return { href: goalHref(INVOICE_JOB), turnedOn: [] };
    }

    const modules = await deps.listModules().catch(() => [] as ModuleView[]);
    const name = moduleName(goal, modules);
    // The same rule Home's cards obey: on offer here, not on already, and
    // this person may turn on it and what it needs.
    const offered = firstRunJobs(modules, kind).some((j) => j.key === goal);
    if (!offered) {
        return {
            href: HOME,
            said: `${name} isn't on offer for this business yet. Pick what to do first from Home.`,
            turnedOn: [],
        };
    }

    const plan = turnOnPlan({ picked: [goal], modules });
    const defaults = await Promise.all(
        plan.order.map((k) => deps.getSetupDefaults(k)),
    );
    const draft = draftFrom(defaults);
    // A default the API couldn't give (an unnamed location) is asked for
    // in the Turn on sheet from Home, never guessed here.
    const asked = plan.order.filter((k) => !NO_SETUP.has(k));
    if (Object.keys(problemsOf(draft, asked)).length > 0) {
        return {
            href: HOME,
            said: `${name} needs a couple of answers first. Pick it from Home to give them.`,
            turnedOn: [],
        };
    }

    const turnedOn: string[] = [];
    let siteId: string | undefined;
    for (const key of plan.order) {
        const res = await deps
            .enableModule(
                key,
                NO_SETUP.has(key) ? undefined : setupFor(key, draft),
            )
            .catch((): EnableResult => ({
                ok: false,
                error: "Saroh couldn't be reached.",
                fields: {},
            }));
        if (!res.ok) {
            const why = Object.values(res.fields)[0] ?? res.error;
            return {
                href: HOME,
                said: `${moduleName(key, modules)} isn't on yet. ${why} Pick it from Home to try again.`,
                turnedOn,
            };
        }
        turnedOn.push(key);
        if (res.siteId) siteId = res.siteId;
    }
    return { href: goalHref(goal, { siteId }), turnedOn };
}
