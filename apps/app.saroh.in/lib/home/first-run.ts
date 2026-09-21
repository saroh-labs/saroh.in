import type { ModuleView } from "@/lib/modules/schema";

/**
 * The first-run question on Home (Saroh Workspace): what a business with
 * nothing turned on is offered, and what each pick actually turns on. Pure, so
 * the rules — who may be offered what, and in which order things switch on —
 * are tested without a browser.
 */
export interface FirstRunJob {
    key: string;
    verb: string;
    note: string;
    /** Read after the word "Adds", so it continues rather than restarts. */
    gives: string;
    /** Prerequisites this pick also turns on, prerequisites first. */
    pulls: string[];
}

/**
 * Four jobs, not the eight modules. They are the ones a business starts with;
 * the rest only mean something once one of these is running, and stay one link
 * away in the full list.
 */
const JOBS: Omit<FirstRunJob, "pulls">[] = [
    {
        key: "COMMERCE",
        verb: "Sell things",
        note: "Take money for products, in person or online.",
        gives: "orders, products, customers and discounts",
    },
    {
        key: "APPOINTMENTS",
        verb: "Take bookings",
        note: "A diary people can book time in.",
        gives: "a schedule and your services",
    },
    {
        key: "WEBSITE",
        verb: "Put up a website",
        note: "Pages, a journal and an address.",
        gives: "pages and posts",
    },
    {
        key: "CRM",
        verb: "Keep track of people",
        note: "Everyone you deal with, in one list.",
        gives: "contacts, leads and a pipeline",
    },
];

/**
 * What a module is called where the merchant will look for it: the sidebar
 * (`components/shared/nav-items.tsx`). The design says "People"; this sidebar
 * says Contacts, and a toast pointing at a row that does not exist sends the
 * merchant looking for nothing.
 */
const SIDEBAR_NAME: Partial<Record<string, string>> = {
    CRM: "Contacts",
    COMMERCE: "Sell",
    APPOINTMENTS: "Bookings",
    WEBSITE: "Website",
};

export function sidebarName(modules: ModuleView[], key: string): string {
    return (
        SIDEBAR_NAME[key] ?? modules.find((m) => m.key === key)?.label ?? key
    );
}

/**
 * Everything a pick switches on, prerequisites before what needs them — the
 * order the API accepts. Dependencies come from the server's read model, never
 * from this file; what is already on is left alone.
 */
export function turnOnOrder(modules: ModuleView[], key: string): string[] {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    const order: string[] = [];
    const visit = (k: string, seen: string[]) => {
        if (seen.includes(k)) return; // a cycle is the server's bug, not a hang
        for (const dep of byKey.get(k)?.dependencies ?? []) {
            visit(dep, [...seen, k]);
        }
        if (!order.includes(k)) order.push(k);
    };
    visit(key, []);
    return order.filter((k) => byKey.get(k)?.lifecycle !== "ENABLED");
}

/**
 * The jobs this person may pick in this business: the module exists here (its
 * rollout reached this business), is not on yet, and they may turn on it AND
 * everything it pulls in. A card whose click the server would refuse is a dead
 * end in a nicer frame.
 */
export function firstRunJobs(modules: ModuleView[]): FirstRunJob[] {
    const byKey = new Map(modules.map((m) => [m.key, m]));
    return JOBS.flatMap((job) => {
        const view = byKey.get(job.key);
        if (!view || view.lifecycle === "ENABLED") return [];
        const order = turnOnOrder(modules, job.key);
        if (!order.every((k) => byKey.get(k)?.canManage)) return [];
        return [{ ...job, pulls: order.filter((k) => k !== job.key) }];
    });
}
