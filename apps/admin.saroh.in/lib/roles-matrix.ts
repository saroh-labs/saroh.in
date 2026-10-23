import type { AdminPermission, AdminRole } from "./control-plane";

/**
 * Console roles as a table (R31, admin console U17): what each role may
 * do, in plain words, grouped by area. Client-safe.
 *
 * Which role holds which permission comes from the API (`GET team/roles`,
 * the registry in `admin-permissions.ts`), so the table never disagrees
 * with what the guard enforces. This file only names them. Every
 * permission in the registry has a row here (`roles-matrix.test.ts` reads
 * the registry and fails on one without words); one the API sends that
 * this file doesn't know yet still shows, under "Other", by its code.
 */

export interface MatrixRowDef {
    key: string;
    label: string;
    /** Holding this, and none of `change`, reads "See". */
    see?: AdminPermission;
    /** Holding any of these reads "Change". */
    change?: AdminPermission[];
}

export interface MatrixAreaDef {
    name: string;
    rows: MatrixRowDef[];
}

export const MATRIX_AREAS: readonly MatrixAreaDef[] = [
    {
        name: "Businesses and their people",
        rows: [
            {
                key: "businesses",
                label: "See every business",
                see: "organization:read",
            },
            {
                key: "contact",
                label: "See people's names, emails and phone numbers",
                see: "organization:pii:read",
            },
            {
                key: "view-as",
                label: "Open a business as they see it",
                change: ["organization:view-as"],
            },
            {
                key: "people",
                label: "Change who is in a business, and their roles",
                change: ["organization:people:write"],
            },
            {
                key: "sign-in",
                label: "Help someone sign in",
                change: ["people:sign-in-help"],
            },
            {
                key: "lifecycle",
                label: "Pause, close or reopen a business",
                change: ["organization:lifecycle:write"],
            },
            {
                key: "legal-hold",
                label: "Lift a legal hold",
                change: ["organization:legal-hold:lift"],
            },
            {
                key: "trackers",
                label: "Switch a website's trackers off or back on",
                change: ["organization:trackers:write"],
            },
            {
                key: "reports",
                label: "Close reports people send about a business",
                change: ["reports:resolve"],
            },
            {
                key: "waitlist",
                label: "The waitlist, and inviting people from it",
                see: "waitlist:read",
                change: ["waitlist:invite"],
            },
        ],
    },
    {
        name: "Money",
        rows: [
            {
                key: "subscription",
                label: "A business's plan and trial",
                see: "subscription:read",
                change: ["subscription:override"],
            },
            {
                key: "pricing",
                label: "Plans and modules: the draft",
                see: "pricing:read",
                change: ["pricing:edit"],
            },
            {
                key: "pricing-publish",
                label: "Publish plans and modules",
                change: ["pricing:publish"],
            },
            {
                key: "pricing-override",
                label: "One business's own plan exceptions",
                change: ["pricing:override"],
            },
            {
                key: "coupons",
                label: "Coupons",
                change: ["coupons:manage"],
            },
            {
                key: "saroh-billing",
                label: "Saroh's invoices and subscriptions",
                see: "saroh-billing:read",
                change: ["saroh-billing:act"],
            },
        ],
    },
    {
        name: "Team and sales",
        rows: [
            {
                key: "team",
                label: "The team and each teammate's details",
                see: "team:read",
                change: ["team:write"],
            },
            {
                key: "accounts",
                label: "Who looks after which business",
                see: "accounts:read",
                change: ["accounts:assign"],
            },
            {
                key: "leads",
                label: "Saroh's own sales leads",
                see: "saroh-leads:read",
                change: ["saroh-leads:write"],
            },
            {
                key: "pay",
                label: "What the team has earned, and marking it paid",
                change: ["team:pay"],
            },
            {
                key: "rates",
                label: "Set commission rates",
                change: ["commission:rates"],
            },
        ],
    },
    {
        name: "Keep it running",
        rows: [
            {
                key: "health",
                label: "Health, Home and the counts",
                see: "platform:read",
            },
            {
                key: "modules",
                label: "Switch a module on for one business",
                change: ["organization:modules:write"],
            },
            {
                key: "jobs",
                label: "Background jobs, and running one again",
                see: "jobs:read",
                change: ["jobs:retry"],
            },
            {
                key: "webhooks",
                label: "Webhooks, and sending one again",
                see: "webhooks:read",
                change: ["webhooks:replay"],
            },
            {
                key: "providers",
                label: "Providers, and checking one again",
                see: "providers:read",
                change: ["providers:recheck"],
            },
            {
                key: "releases",
                label: "Releases: who gets a new feature",
                see: "flags:read",
                change: ["flags:publish"],
            },
            {
                key: "deployments",
                label: "Deploy Saroh's apps",
                change: ["deployments:run"],
            },
        ],
    },
    {
        name: "Console access",
        rows: [
            {
                key: "staff",
                label: "Who has access to this console",
                see: "staff:read",
                change: ["staff:grant"],
            },
            {
                key: "audit",
                label: "The audit trail",
                see: "audit:read",
            },
        ],
    },
];

/** Every permission this file has words for, in table order. */
export function namedPermissions(): AdminPermission[] {
    return MATRIX_AREAS.flatMap((area) =>
        area.rows.flatMap((row) => [
            ...(row.see ? [row.see] : []),
            ...(row.change ?? []),
        ]),
    );
}

/**
 * Roles that see only their own businesses and leads (the API's
 * `OWN_SCOPED_ROLES`): their cells say so.
 */
const OWN_SCOPED: readonly AdminRole[] = ["ACCOUNT_MANAGER"];

export type CellLevel = "change" | "see" | "none";

export interface MatrixCell {
    level: CellLevel;
    /** Only their own businesses and leads. */
    own: boolean;
}

export interface MatrixRow {
    key: string;
    label: string;
    codes: AdminPermission[];
    cells: Record<string, MatrixCell>;
}

export interface MatrixArea {
    name: string;
    rows: MatrixRow[];
}

export interface RolesMatrix {
    roles: AdminRole[];
    areas: MatrixArea[];
}

/** A cell in words: "Change", "See", "—", or "… their own". */
export function cellWords(cell: MatrixCell): string {
    if (cell.level === "none") return "—";
    const word = cell.level === "change" ? "Change" : "See";
    return cell.own ? `${word} their own` : word;
}

/** A cell for screen readers, where "—" says nothing. */
export function cellLabel(cell: MatrixCell): string {
    return cell.level === "none" ? "Can't" : cellWords(cell);
}

/**
 * The table for these roles, from what each holds. A permission held by a
 * role but named nowhere here gets its own row under "Other", by code.
 */
export function buildRolesMatrix(
    definitions: readonly { role: AdminRole; permissions: AdminPermission[] }[],
): RolesMatrix {
    const roles = definitions.map((d) => d.role);
    const held = new Map(
        definitions.map((d) => [d.role, new Set<string>(d.permissions)]),
    );
    const cellsFor = (def: MatrixRowDef): Record<string, MatrixCell> => {
        const cells: Record<string, MatrixCell> = {};
        for (const role of roles) {
            const has = held.get(role) ?? new Set<string>();
            const level: CellLevel = (def.change ?? []).some((p) => has.has(p))
                ? "change"
                : def.see && has.has(def.see)
                  ? "see"
                  : "none";
            cells[role] = {
                level,
                own: level !== "none" && OWN_SCOPED.includes(role),
            };
        }
        return cells;
    };
    const toRow = (def: MatrixRowDef): MatrixRow => ({
        key: def.key,
        label: def.label,
        codes: [...(def.see ? [def.see] : []), ...(def.change ?? [])],
        cells: cellsFor(def),
    });

    const areas: MatrixArea[] = MATRIX_AREAS.map((area) => ({
        name: area.name,
        rows: area.rows.map(toRow),
    }));
    const named = new Set<string>(namedPermissions());
    const unknown = [
        ...new Set(definitions.flatMap((d) => d.permissions)),
    ].filter((p) => !named.has(p));
    if (unknown.length > 0) {
        areas.push({
            name: "Other",
            rows: unknown.map((code) =>
                toRow({ key: code, label: code, change: [code] }),
            ),
        });
    }
    return { roles, areas };
}

/** "1 person", "3 people", "Nobody". */
export function holdersWords(count: number): string {
    if (count === 0) return "Nobody";
    return count === 1 ? "1 person" : `${count} people`;
}
