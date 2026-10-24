// Upgrade prompts (#1197, DEC-187): what is sent, with the plan derived on
// the server, and what is refused. Prisma and PostHog are fakes; the per-day
// dedupe against a real table is upgrade-prompts.db.spec.ts.
jest.mock("posthog-node", () => ({ PostHog: class {} }));
jest.mock("@saroh/database", () => ({
    prisma: { $executeRaw: jest.fn() },
}));

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { TelemetryTransport } from "../../common/observability/posthog";
import { setTelemetry } from "../../common/observability/posthog";
import type { OrgRole } from "../../common/types/organization-context";
import type {
    BusinessAccess,
    CatalogueAccessService,
} from "./catalogue-access.service";
import {
    isPromptKey,
    PROMPT_KEYS,
    promptPlans,
    UpgradePromptsService,
} from "./upgrade-prompts";

const executeRaw = prisma.$executeRaw as unknown as jest.Mock;

const ctx = (role: OrgRole = "OWNER") => ({
    organizationId: "org_1",
    userId: "user_1",
    role,
});

/** A Free business: payments locked (Grow has it), roles locked (Pro). */
const freeAccess = {
    source: "catalogue",
    planId: "free",
    catalog: {
        plans: [{ id: "free" }, { id: "grow" }, { id: "pro", retired: false }],
    },
    modules: [
        { moduleId: "payments", state: "locked", upgradePlanId: "grow" },
        { moduleId: "subscriptions", state: "on", upgradePlanId: "" },
        { moduleId: "roles", state: "locked", upgradePlanId: "pro" },
        { moduleId: "website", state: "on", upgradePlanId: "grow" },
    ],
} as unknown as BusinessAccess;

function build(access: BusinessAccess = freeAccess) {
    const transport = {
        capture: jest.fn(),
        captureException: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
    } satisfies TelemetryTransport;
    setTelemetry({ transport, environment: "development" });
    const resolve = jest.fn().mockResolvedValue(access);
    const service = new UpgradePromptsService({
        resolve,
    } as unknown as CatalogueAccessService);
    return { transport, service, resolve };
}

beforeEach(() => {
    executeRaw.mockReset().mockResolvedValue(1);
});
afterEach(() => setTelemetry(null));

describe("promptPlans", () => {
    it("offers the plan above that has the row each prompt sells", () => {
        expect(promptPlans(freeAccess, "deposits")).toEqual({
            offered: "grow",
            current: "free",
        });
        expect(promptPlans(freeAccess, "team_member").offered).toBe("pro");
        expect(promptPlans(freeAccess, "own_domain").offered).toBe("grow");
    });

    it("reads memberships as the app's lock does: the row that stops it", () => {
        expect(promptPlans(freeAccess, "memberships").offered).toBe("grow");
    });

    it("offers the next plan up for a limit or a refusal", () => {
        for (const key of ["near_limit", "at_limit", "plan_refusal"] as const)
            expect(promptPlans(freeAccess, key).offered).toBe("grow");
        const onPro = { ...freeAccess, planId: "pro" } as BusinessAccess;
        expect(promptPlans(onPro, "at_limit")).toEqual({
            offered: "none",
            current: "pro",
        });
    });

    it("says none for a business the catalogue doesn't reach", () => {
        expect(
            promptPlans(
                { source: "legacy" } as unknown as BusinessAccess,
                "deposits",
            ),
        ).toEqual({ offered: "none", current: "none" });
    });

    it("knows its own keys and no others", () => {
        expect(PROMPT_KEYS).toHaveLength(8);
        for (const key of PROMPT_KEYS) expect(isPromptKey(key)).toBe(true);
        expect(isPromptKey("toString")).toBe(false);
        expect(isPromptKey("free_trial")).toBe(false);
    });
});

describe("UpgradePromptsService", () => {
    it("sends a known prompt's shown with the plan derived on the server", async () => {
        const { service, transport } = build();
        await service.record(ctx(), "deposits", "shown");
        expect(executeRaw).toHaveBeenCalledTimes(1);
        expect(transport.capture).toHaveBeenCalledTimes(1);
        const sent = transport.capture.mock.calls[0][0];
        expect(sent.event).toBe("upgrade_prompt_shown");
        expect(sent.distinctId).toBe("org_1");
        expect(sent.properties).toMatchObject({
            prompt: "deposits",
            plan_offered: "grow",
            plan_key: "free",
        });
    });

    it("sends nothing for a shown already marked today", async () => {
        const { service, transport, resolve } = build();
        executeRaw.mockResolvedValue(0);
        await service.record(ctx(), "deposits", "shown");
        expect(transport.capture).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
    });

    it("always sends pressed, without marking a day", async () => {
        const { service, transport } = build();
        await service.record(ctx(), "own_domain", "pressed");
        await service.record(ctx(), "own_domain", "pressed");
        expect(executeRaw).not.toHaveBeenCalled();
        expect(transport.capture).toHaveBeenCalledTimes(2);
        expect(transport.capture.mock.calls[0][0].event).toBe(
            "upgrade_prompt_pressed",
        );
    });

    it("refuses an unknown key or action with a 400, and sends nothing", async () => {
        const { service, transport } = build();
        await expect(
            service.record(ctx(), "free_trial", "shown"),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.record(ctx(), "deposits", "closed"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(executeRaw).not.toHaveBeenCalled();
        expect(transport.capture).not.toHaveBeenCalled();
    });

    it("refuses a role without org:read", async () => {
        const { service } = build();
        await expect(
            service.record(ctx("REVIEWER"), "deposits", "shown"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("reads and writes nothing with PostHog off", async () => {
        const { service, resolve } = build();
        setTelemetry(null);
        await service.record(ctx(), "deposits", "shown");
        expect(executeRaw).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
    });

    it("never fails the request when the plan can't be read", async () => {
        const { service, transport, resolve } = build();
        resolve.mockRejectedValue(new Error("db down"));
        await expect(
            service.record(ctx(), "at_limit", "pressed"),
        ).resolves.toBeUndefined();
        expect(transport.capture).not.toHaveBeenCalled();
    });
});
