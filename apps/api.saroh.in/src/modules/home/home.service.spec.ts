import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { HomeService } from "./home.service";

type View = {
    key: string;
    label: string;
    readiness: string;
    blockers?: { code: string; message?: string; actionHref?: string }[];
};

function build(
    views: View[],
    counts: { activity?: number; order?: number } = {},
) {
    const availability = {
        listViews: jest
            .fn()
            .mockResolvedValue(views.map((v) => ({ blockers: [], ...v }))),
    } as unknown as ModuleAvailabilityService;
    const db = {
        activity: { count: jest.fn().mockResolvedValue(counts.activity ?? 0) },
        order: { count: jest.fn().mockResolvedValue(counts.order ?? 0) },
    };
    return new HomeService(availability, db as never);
}

const INPUT = { organizationId: "org_1", organizationRole: "OWNER" as const };

describe("HomeService ranking", () => {
    it("puts an attention action before a suggestion", async () => {
        const svc = build(
            [
                {
                    key: "PAYMENTS",
                    label: "Payments",
                    readiness: "ATTENTION_REQUIRED",
                    blockers: [{ code: "X", message: "Provider failing" }],
                },
                { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
            ],
            { order: 0 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.severity).toBe("ATTENTION");
        expect(model.primaryAction?.moduleKey).toBe("PAYMENTS");
    });

    it("puts an overdue follow-up before a generic analytics nudge", async () => {
        const svc = build(
            [
                { key: "CRM", label: "CRM", readiness: "ACTIVE" },
                { key: "INSIGHTS", label: "Insights", readiness: "ACTIVE" },
            ],
            { activity: 3 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("CRM_OVERDUE_FOLLOWUPS");
        const codes = model.actions.map((a) => a.code);
        expect(codes.indexOf("CRM_OVERDUE_FOLLOWUPS")).toBeLessThan(
            codes.indexOf("INSIGHTS_VIEW"),
        );
    });

    it("puts an unfulfilled order before a module still awaiting setup", async () => {
        // The pair that was ranked backwards: a paying customer waiting on an
        // order outranks configuration a merchant can do whenever.
        const svc = build(
            [
                { key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" },
                {
                    key: "COMMUNICATIONS",
                    label: "Communications",
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        { code: "NO_PROVIDER", message: "Connect a provider." },
                    ],
                },
            ],
            { order: 1 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("COMMERCE_OPEN_ORDERS");
        const codes = model.actions.map((a) => a.code);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(codes.length);
        expect(
            model.actions.findIndex((a) => a.severity === "OVERDUE"),
        ).toBeLessThan(model.actions.findIndex((a) => a.severity === "SETUP"));
    });

    it("emits no appointment actions when Appointments is disabled", async () => {
        const svc = build([
            {
                key: "APPOINTMENTS",
                label: "Appointments",
                readiness: "DISABLED",
            },
            { key: "CRM", label: "CRM", readiness: "ACTIVE" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.actions.some((a) => a.moduleKey === "APPOINTMENTS")).toBe(
            false,
        );
    });

    it("reports no modules for a brand-new Organization", async () => {
        const svc = build([
            { key: "CRM", label: "CRM", readiness: "DISABLED" },
            { key: "COMMERCE", label: "Commerce", readiness: "DISABLED" },
        ]);
        const model = await svc.build(INPUT);
        expect(model.hasAnyModule).toBe(false);
        expect(model.primaryAction).toBeNull();
    });

    it("surfaces open orders as overdue work when Commerce is active", async () => {
        const svc = build(
            [{ key: "COMMERCE", label: "Commerce", readiness: "ACTIVE" }],
            { order: 2 },
        );
        const model = await svc.build(INPUT);
        expect(model.primaryAction?.code).toBe("COMMERCE_OPEN_ORDERS");
        expect(model.primaryAction?.title).toContain("2");
    });
});
