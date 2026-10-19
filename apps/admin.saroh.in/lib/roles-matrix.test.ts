import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { AdminPermission, AdminRole } from "./control-plane";
import {
    buildRolesMatrix,
    cellWords,
    holdersWords,
    MATRIX_AREAS,
    namedPermissions,
} from "./roles-matrix";

/**
 * Console roles (R31): every permission in the API's registry has plain
 * words here, so the table always covers them all. The registry is read
 * as text (the console never imports the API's code), from the closed
 * `AdminPermission` object in `admin-permissions.ts`.
 */
const REGISTRY = path.resolve(
    __dirname,
    "../../api.saroh.in/src/modules/admin/admin-permissions.ts",
);

function registryPermissions(): string[] {
    const source = readFileSync(REGISTRY, "utf8");
    const start = source.indexOf("export const AdminPermission = {");
    const end = source.indexOf("} as const;", start);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, end);
    return [...body.matchAll(/^\s+\w+:\s*"([^"]+)",?\s*$/gm)].map((match) =>
        String(match[1]),
    );
}

/** A row's cell for a role, in words; fails when either is missing. */
function cellOf(
    matrix: ReturnType<typeof buildRolesMatrix>,
    key: string,
    role: AdminRole,
): string {
    const row = matrix.areas
        .flatMap((area) => area.rows)
        .find((r) => r.key === key);
    const cell = row?.cells[role];
    if (!cell) throw new Error(`no ${role} cell on ${key}`);
    return cellWords(cell);
}

describe("the roles matrix", () => {
    it("has words for every permission in the registry, each once", () => {
        const registry = registryPermissions();
        expect(registry.length).toBeGreaterThan(30);
        const named = namedPermissions();
        expect(new Set(named).size).toBe(named.length);
        expect([...named].sort()).toEqual([...registry].sort());
    });

    it("labels every row in words, never by its code", () => {
        for (const area of MATRIX_AREAS) {
            for (const row of area.rows) {
                expect(row.label).not.toMatch(/[a-z]+:[a-z]/);
                expect(row.label.length).toBeGreaterThan(3);
            }
        }
    });

    it("reads Change, See or — from what each role holds", () => {
        const matrix = buildRolesMatrix([
            {
                role: "AUDITOR",
                permissions: ["jobs:read", "audit:read"],
            },
            { role: "OPERATIONS", permissions: ["jobs:read", "jobs:retry"] },
            { role: "BILLING", permissions: [] },
        ]);
        const jobs = matrix.areas
            .flatMap((area) => area.rows)
            .find((row) => row.key === "jobs");
        expect(jobs?.codes).toEqual(["jobs:read", "jobs:retry"]);
        expect(cellOf(matrix, "jobs", "AUDITOR")).toBe("See");
        expect(cellOf(matrix, "jobs", "OPERATIONS")).toBe("Change");
        expect(cellOf(matrix, "jobs", "BILLING")).toBe("—");
    });

    it("says an Account manager's cells are their own only", () => {
        const matrix = buildRolesMatrix([
            {
                role: "ACCOUNT_MANAGER",
                permissions: [
                    "accounts:read",
                    "saroh-leads:read",
                    "saroh-leads:write",
                ],
            },
        ]);
        const cell = (key: string) => cellOf(matrix, key, "ACCOUNT_MANAGER");
        expect(cell("accounts")).toBe("See their own");
        expect(cell("leads")).toBe("Change their own");
        expect(cell("businesses")).toBe("—");
    });

    it("still shows a permission it has no words for, by its code, under Other", () => {
        const matrix = buildRolesMatrix([
            {
                role: "PLATFORM_OWNER",
                permissions: [
                    "audit:read",
                    "brand-new:thing" as AdminPermission,
                ],
            },
        ]);
        const other = matrix.areas.find((area) => area.name === "Other");
        expect(other?.rows.map((row) => row.label)).toEqual([
            "brand-new:thing",
        ]);
        expect(cellOf(matrix, "brand-new:thing", "PLATFORM_OWNER")).toBe(
            "Change",
        );
    });

    it("counts holders in words", () => {
        expect(holdersWords(0)).toBe("Nobody");
        expect(holdersWords(1)).toBe("1 person");
        expect(holdersWords(3)).toBe("3 people");
    });
});
