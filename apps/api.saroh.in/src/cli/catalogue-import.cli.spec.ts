/**
 * `catalogue:import` without a database: the guard that keeps it on this
 * machine, the file it reads, and what it prints. Publishing the snapshot
 * for real is `modules/pricing/catalogue-import.db.spec.ts`.
 *
 * The catalogue is the made-up test one (`test/fixtures/pricing-catalog.ts`).
 */
jest.mock("../env", () => ({ env: {} }));

import { fakeCatalog } from "../../test/fixtures/pricing-catalog";
import type {
    CatalogueWritesService,
    ImportResult,
} from "../modules/pricing/catalogue-writes.service";
import {
    formatResult,
    hasBillingKeys,
    main,
    parseCatalogueFile,
} from "./catalogue-import.cli";

const LOCAL = "postgresql://u:pw@localhost:5432/saroh-dev";
const REMOTE =
    "postgresql://u:pw@ep-example-host-1.ap-southeast-1.aws.neon.tech/saroh-dev";

const file = (catalog: unknown = fakeCatalog()) =>
    JSON.stringify({
        version: 7,
        goLiveAt: "2026-10-01T00:00:00.000Z",
        catalog,
    });

function result(over: Partial<ImportResult> = {}): ImportResult {
    return {
        version: 2,
        goLiveAt: "2026-10-14T00:00:00.000Z",
        status: "live",
        policy: "keep",
        changes: ["a", "b"],
        moves: { moved: 0, notices: 0 },
        providerPlans: 4,
        settledLocally: 4,
        ...over,
    };
}

function writes(impl: () => Promise<ImportResult>) {
    const importSnapshot = jest.fn(impl);
    return {
        writes: { importSnapshot } as unknown as CatalogueWritesService,
        importSnapshot,
    };
}

const saved = { ...process.env };
let errors: string[];
let infos: string[];

beforeEach(() => {
    errors = [];
    infos = [];
    jest.spyOn(console, "error").mockImplementation((m: string) => {
        errors.push(m);
    });
    jest.spyOn(console, "info").mockImplementation((m: string) => {
        infos.push(m);
    });
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_TARGET_CONFIRM;
    process.env.DATABASE_URL = LOCAL;
});
afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
});

describe("the local-database guard", () => {
    it("refuses a database that isn't on this machine, even when confirmed, and writes nothing", async () => {
        process.env.DATABASE_URL = REMOTE;
        process.env.DATABASE_TARGET_CONFIRM = "saroh-dev";
        const w = writes(async () => result());
        const read = jest.fn(() => file());
        expect(await main(["c.json"], { writes: w.writes, read })).toBe(2);
        expect(w.importSnapshot).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        expect(errors.join("\n")).toMatch(/isn't on this machine/);
        // Never the connection string.
        expect([...errors, ...infos].join("\n")).not.toContain("pw@");
    });

    it("refuses a local database that isn't allow-listed unless it is named", async () => {
        process.env.DATABASE_URL =
            "postgresql://u:pw@localhost:5432/saroh_scratch";
        const w = writes(async () => result());
        expect(
            await main(["c.json"], { writes: w.writes, read: () => file() }),
        ).toBe(2);
        expect(w.importSnapshot).not.toHaveBeenCalled();

        process.env.DATABASE_TARGET_CONFIRM = "saroh_scratch";
        expect(
            await main(["c.json"], {
                writes: w.writes,
                read: () => file(),
                hasKeys: () => false,
            }),
        ).toBe(0);
        expect(w.importSnapshot).toHaveBeenCalledTimes(1);
    });
});

describe("the file", () => {
    it("reads the admin's download", () => {
        const r = parseCatalogueFile(file());
        expect(r.ok && r.file.version).toBe(7);
    });

    it("rejects a file that isn't JSON or has no catalogue", () => {
        expect(parseCatalogueFile("{nope")).toEqual({
            ok: false,
            error: "the file isn't JSON",
        });
        expect(parseCatalogueFile("[]").ok).toBe(false);
        expect(parseCatalogueFile('{"version":1}').ok).toBe(false);
    });

    it("prints the schema's errors for a broken catalogue and fails", async () => {
        const { BadRequestException } = await import("@nestjs/common");
        const w = writes(async () => {
            throw new BadRequestException({
                message: "That catalogue doesn't validate.",
                details: { errors: ["plans.0.pricePaise: Invalid input"] },
            });
        });
        const broken = fakeCatalog() as unknown as Record<string, unknown>;
        expect(
            await main(["c.json"], {
                writes: w.writes,
                read: () => file({ ...broken, plans: "no" }),
                hasKeys: () => false,
            }),
        ).toBe(1);
        expect(errors.join("\n")).toMatch(/doesn't validate/);
        expect(errors.join("\n")).toMatch(/plans\.0\.pricePaise/);
    });

    it("says a usage line without a file", async () => {
        expect(await main([])).toBe(2);
        expect(errors[0]).toMatch(/usage/);
    });
});

describe("the import", () => {
    it("settles the provider plans itself only when there are no Razorpay keys", async () => {
        const w = writes(async () => result());
        await main(["c.json"], {
            writes: w.writes,
            read: () => file(),
            hasKeys: () => false,
        });
        expect(w.importSnapshot).toHaveBeenLastCalledWith(
            expect.objectContaining({
                settleProviderPlans: true,
                note: "Copy of version 7, imported from a catalogue file",
            }),
            expect.any(Date),
        );
        await main(["c.json"], {
            writes: w.writes,
            read: () => file(),
            hasKeys: () => true,
        });
        expect(w.importSnapshot).toHaveBeenLastCalledWith(
            expect.objectContaining({ settleProviderPlans: false }),
            expect.any(Date),
        );
    });

    it("is fine with a catalogue that is live already", async () => {
        const { ConflictException } = await import("@nestjs/common");
        const w = writes(async () => {
            throw new ConflictException(
                "That catalogue is version 3, which is live already. There's nothing to import.",
            );
        });
        expect(
            await main(["c.json"], {
                writes: w.writes,
                read: () => file(),
                hasKeys: () => false,
            }),
        ).toBe(0);
        expect(infos.join("\n")).toMatch(/live already/);
    });

    it("prints numbers only", () => {
        const lines = formatResult(result(), {
            version: 7,
            goLiveAt: null,
            catalog: {},
        });
        expect(lines[0]).toBe(
            "published version 7 as local version 2, live, policy keep",
        );
        expect(lines.join("\n")).toMatch(/synced locally/);
        expect(
            formatResult(result({ settledLocally: 0, status: "waiting" }), {
                version: null,
                goLiveAt: null,
                catalog: {},
            }).join("\n"),
        ).toMatch(/wait for the billing sync/);
    });

    it("needs both Razorpay keys to leave the sync to the provider", () => {
        expect(hasBillingKeys(() => undefined)).toBe(false);
        expect(
            hasBillingKeys((n) => (n.endsWith("KEY_ID") ? "x" : undefined)),
        ).toBe(false);
        expect(hasBillingKeys(() => "x")).toBe(true);
    });
});
