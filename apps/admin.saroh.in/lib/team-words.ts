import type { AdminPermission, AdminRole } from "./control-plane";

/**
 * The Team screen in words (DEC-169, admin console U17). Client-safe: the
 * people table, the job filter and the Add a teammate sheet all read it.
 * No price, plan limit or commission rate is ever written here: the rates
 * live in the database (DEC-169).
 */

/** What a teammate works as (the API's `STAFF_JOBS`). */
export const STAFF_JOBS = [
    "ACCOUNT_MANAGER_JOB",
    "FINDS_BUSINESSES",
    "OTHER",
] as const;
export type StaffJob = (typeof STAFF_JOBS)[number];

export const JOB_LABEL: Record<StaffJob, string> = {
    ACCOUNT_MANAGER_JOB: "Account manager",
    FINDS_BUSINESSES: "Finds new businesses",
    OTHER: "Something else",
};

/** One line under each job in the sheet. */
export const JOB_LINE: Record<StaffJob, string> = {
    ACCOUNT_MANAGER_JOB: "Looks after businesses once they start paying.",
    FINDS_BUSINESSES: "Works leads until they become paying businesses.",
    OTHER: "Engineering, accounts or support. Looks after no businesses.",
};

/** The job filter's chips, in order. "No job yet" only when someone has none. */
export type JobFilter = "all" | StaffJob | "none";

export const JOB_FILTER_LABEL: Record<JobFilter, string> = {
    all: "Everyone",
    ACCOUNT_MANAGER_JOB: "Account managers",
    FINDS_BUSINESSES: "Find new businesses",
    OTHER: "Something else",
    none: "No job yet",
};

/** A sales job: one that looks after or brings in businesses. */
export function isSalesJob(job: StaffJob | null | undefined): boolean {
    return job === "ACCOUNT_MANAGER_JOB" || job === "FINDS_BUSINESSES";
}

/**
 * The console role the sheet suggests for a job (R32): Account manager for
 * both sales jobs, Support for anything else.
 */
export function suggestedRole(job: StaffJob): AdminRole {
    return isSalesJob(job) ? "ACCOUNT_MANAGER" : "SUPPORT";
}

/** Someone on the list: a teammate with access, or an invite waiting. */
export interface TeamRow {
    /** platformAdminId, or `invite:<id>`. */
    id: string;
    kind: "member" | "invite";
    name: string;
    email: string;
    job: StaffJob | null;
    roles: AdminRole[];
}

/** Whether a row passes the job filter and the search. */
export function rowPasses(row: TeamRow, filter: JobFilter, q: string): boolean {
    if (filter === "none") {
        if (row.job !== null) return false;
    } else if (filter !== "all" && row.job !== filter) {
        return false;
    }
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (
        row.name.toLowerCase().includes(term) ||
        row.email.toLowerCase().includes(term)
    );
}

/** How many rows each chip would show, ignoring the search. */
export function jobCounts(rows: readonly TeamRow[]): Record<JobFilter, number> {
    const counts: Record<JobFilter, number> = {
        all: rows.length,
        ACCOUNT_MANAGER_JOB: 0,
        FINDS_BUSINESSES: 0,
        OTHER: 0,
        none: 0,
    };
    for (const row of rows) counts[row.job ?? "none"] += 1;
    return counts;
}

/** The chips to draw: every job, and "No job yet" only when it has someone. */
export function jobChips(counts: Record<JobFilter, number>): JobFilter[] {
    const chips: JobFilter[] = ["all", ...STAFF_JOBS];
    if (counts.none > 0) chips.push("none");
    return chips;
}

/** Their load against capacity (R30): full at capacity. */
export interface Load {
    count: number;
    capacity: number | null;
    full: boolean;
    /** 0–100, for the bar; 0 with no capacity set. */
    percent: number;
}

export function loadOf(count: number, capacity: number | null): Load {
    if (capacity === null || capacity <= 0) {
        return { count, capacity: null, full: false, percent: 0 };
    }
    return {
        count,
        capacity,
        full: count >= capacity,
        percent: Math.min(100, Math.round((count / capacity) * 100)),
    };
}

/** "3 of 10 businesses", "1 business", ", full" at capacity. */
export function loadWords(load: Load): string {
    if (load.capacity === null) {
        return load.count === 1 ? "1 business" : `${load.count} businesses`;
    }
    return `${load.count} of ${load.capacity} businesses${load.full ? ", full" : ""}`;
}

/** Whether a teammate looks after businesses at all (a load to show). */
export function looksAfterBusinesses(input: {
    job: StaffJob | null;
    roles: readonly AdminRole[];
    businesses: number;
}): boolean {
    return (
        input.businesses > 0 ||
        input.roles.includes("ACCOUNT_MANAGER") ||
        isSalesJob(input.job)
    );
}

/** The earliest end of any role they hold; null when none ends. */
export function accessEnds(
    roles: readonly { expiresAt: string | null }[],
): string | null {
    const ends = roles
        .map((role) => role.expiresAt)
        .filter((at): at is string => Boolean(at))
        .sort();
    return ends[0] ?? null;
}

/** The Team screen's tabs, each an address; Payouts only with `team:pay`. */
export const TEAM_TABS = [
    { id: "teammates", label: "Teammates", href: "/team" },
    { id: "roles", label: "Console roles", href: "/team/roles" },
    { id: "payouts", label: "Payouts", href: "/team/payouts" },
] as const;
export type TeamTab = (typeof TEAM_TABS)[number]["id"];

export function teamTabsFor(
    permissions: readonly AdminPermission[],
): (typeof TEAM_TABS)[number][] {
    return TEAM_TABS.filter(
        (tab) => tab.id !== "payouts" || permissions.includes("team:pay"),
    );
}

/** Which tab an address is. */
export function teamTabOf(pathname: string): TeamTab {
    const rest = pathname.replace(/^\/team\/?/, "").split("/")[0];
    if (rest === "roles") return "roles";
    if (rest === "payouts") return "payouts";
    return "teammates";
}
