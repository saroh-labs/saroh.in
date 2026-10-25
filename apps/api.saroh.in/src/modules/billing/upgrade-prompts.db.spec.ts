/**
 * Upgrade prompts (#1197, DEC-187) against a real Postgres: "shown" is
 * sent once per business, prompt and IST day, however often it is asked;
 * the next IST day it is sent again; another prompt or business is its own.
 * The plan read is a fake (the derivation is upgrade-prompts.spec.ts);
 * PostHog is a fake transport.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("posthog-node", () => ({ PostHog: class {} }));

import { prisma } from "@saroh/database";

import { setTelemetry } from "../../common/observability/posthog";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { CatalogueAccessService } from "./catalogue-access.service";
import { UpgradePromptsService } from "./upgrade-prompts";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Northwind Supply", slug: uniq("u13-org-") },
    });
    return { organizationId: org.id, userId: "user_owner", role: "OWNER" };
}

const capture = jest.fn();
const service = new UpgradePromptsService({
    resolve: () => Promise.resolve({ source: "legacy" }),
} as unknown as CatalogueAccessService);

// 23:00 IST on 24 Oct, then 01:00 IST on 25 Oct (two hours apart).
const LATE = new Date("2026-10-24T17:30:00.000Z");
const NEXT_DAY = new Date("2026-10-24T19:30:00.000Z");

const shownCount = () =>
    capture.mock.calls.filter(
        ([m]: [{ event: string }]) => m.event === "upgrade_prompt_shown",
    ).length;

beforeEach(() => {
    capture.mockReset();
    setTelemetry({
        transport: {
            capture,
            captureException: jest.fn(),
            shutdown: () => Promise.resolve(),
        },
        environment: "development",
    });
});
afterAll(() => setTelemetry(null));

describe("upgrade prompts shown once a day (real database)", () => {
    it("sends shown once for twice in one IST day, and again the next", async () => {
        const ctx = await business();
        await service.record(ctx, "deposits", "shown", LATE);
        await service.record(ctx, "deposits", "shown", LATE);
        expect(shownCount()).toBe(1);

        await service.record(ctx, "deposits", "shown", NEXT_DAY);
        expect(shownCount()).toBe(2);

        const org = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { promptsShown: true },
        });
        expect(org?.promptsShown).toEqual({ deposits: "2026-10-25" });
    });

    it("counts each prompt and each business apart, and keeps the others' days", async () => {
        const a = await business();
        const b = await business();
        await Promise.all([
            service.record(a, "deposits", "shown", LATE),
            service.record(a, "deposits", "shown", LATE),
        ]);
        await service.record(a, "own_domain", "shown", LATE);
        await service.record(b, "deposits", "shown", LATE);
        expect(shownCount()).toBe(3);

        const org = await prisma.organization.findUnique({
            where: { id: a.organizationId },
            select: { promptsShown: true },
        });
        expect(org?.promptsShown).toEqual({
            deposits: "2026-10-24",
            own_domain: "2026-10-24",
        });
    });

    it("sends every press, and marks no day for it", async () => {
        const ctx = await business();
        await service.record(ctx, "at_limit", "pressed", LATE);
        await service.record(ctx, "at_limit", "pressed", LATE);
        expect(capture).toHaveBeenCalledTimes(2);
        const org = await prisma.organization.findUnique({
            where: { id: ctx.organizationId },
            select: { promptsShown: true },
        });
        expect(org?.promptsShown).toBeNull();
    });
});
