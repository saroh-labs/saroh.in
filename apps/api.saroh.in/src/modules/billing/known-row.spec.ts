/**
 * The admin's "add known row" (`knownRowCells`) must leave every answer
 * the API gives the same as with the row missing (review P1, 21 Nov): a
 * row added locked where its absence reads as open took features away
 * from every business once published. For each `MODULE_MAP` row, on each
 * plan of the sample catalogue, the row's own reader, the registry
 * modules and the legacy key read the same before and after.
 */
jest.mock("@saroh/database", () => ({
    prisma: {},
    onTransaction: jest.fn(),
    runInOrgContext: jest.fn(),
}));

import type { Catalog, ModuleAccess } from "@saroh/pricing-catalog";
import {
    knownRowCells,
    MODULE_MAP,
    resolveAllAccess,
} from "@saroh/pricing-catalog";
import { SEED_CATALOG } from "@saroh/pricing-catalog/seed";

import { rpmCap } from "../rate-limits/caps";
import { trackersIncluded } from "../sites/public-head.service";
import { entitlementMapFor, registryModuleIncluded } from "./catalogue-access";
import { rowGate } from "./metering.service";

const now = new Date("2026-11-21T00:00:00Z");
const REGISTRIES = [
    ...new Set(
        Object.values(MODULE_MAP).flatMap((e) =>
            e.registry ? [e.registry] : [],
        ),
    ),
];

/** How the API reads one row, as its own call site does. */
function ownAnswer(
    id: string,
    row: ModuleAccess | null,
    entitlements: Record<string, number | boolean>,
    access: Parameters<typeof trackersIncluded>[0],
): unknown {
    switch (id) {
        case "social":
        case "ask-ai":
            return row?.state === "on";
        case "google-accounts":
            return row?.state === "on" ? row.limit : 1;
        case "site-trackers":
            return trackersIncluded(access);
        case "courses":
        case "class-packs":
            // Asked only through their registry module (`module-plan.ts`).
            return null;
        case "api-mcp":
            return rpmCap(entitlements[id]);
        case "api-secret":
        case "api-storefront":
        case "api-keys":
        case "webhooks":
            return Boolean(entitlements[id]);
        default:
            // `assertIncluded`, `isIncluded`, `roomInTx`: no row is open.
            return row ? rowGate(row, false) : "open";
    }
}

function answers(catalog: Catalog, planId: string, id: string) {
    const modules = resolveAllAccess({
        catalog,
        planId,
        overrides: [],
        addons: [],
        now,
    });
    const row = modules.find((m) => m.moduleId === id) ?? null;
    const entitlements = entitlementMapFor({
        catalog,
        access: modules,
        planId,
        legacyRow: null,
    });
    const legacyKey = MODULE_MAP[id].legacyEntitlementKey;
    return {
        own: ownAnswer(id, row, entitlements, {
            source: "catalogue",
            modules,
        } as never),
        registries: REGISTRIES.map((r) =>
            registryModuleIncluded(catalog, modules, r, planId),
        ),
        legacy: legacyKey ? (entitlements[legacyKey] ?? null) : null,
    };
}

describe("adding a known row changes nothing the API answers (P1)", () => {
    const ids = Object.keys(MODULE_MAP).filter(
        (id) => MODULE_MAP[id].missingReads !== "neither",
    );

    it.each(ids)("%s", (id) => {
        // A row the sample doesn't sell yet (the API rows) still gets checked.
        const seeded = SEED_CATALOG.modules.find((m) => m.id === id);
        const from = seeded ?? {
            name: id,
            group: SEED_CATALOG.groups[0].id,
            what: "",
        };
        const without = structuredClone(SEED_CATALOG);
        without.modules = without.modules.filter((m) => m.id !== id);
        const cells = knownRowCells(without, id);
        expect(cells).not.toBeNull();
        const added = structuredClone(without);
        // The shape the admin's `addKnownRow` adds: no rail entry.
        added.modules.push({
            id,
            name: from.name,
            group: from.group,
            pricing: "hidden",
            what: from.what,
            cells: cells!,
        });
        for (const plan of SEED_CATALOG.plans) {
            expect(answers(added, plan.id, id)).toEqual(
                answers(without, plan.id, id),
            );
        }
    });

    it("never adds a row no cell reads the same as missing", () => {
        for (const id of ["sites", "locations", "payments", "subscriptions"]) {
            const without = structuredClone(SEED_CATALOG);
            without.modules = without.modules.filter((m) => m.id !== id);
            expect(knownRowCells(without, id)).toBeNull();
        }
    });
});
