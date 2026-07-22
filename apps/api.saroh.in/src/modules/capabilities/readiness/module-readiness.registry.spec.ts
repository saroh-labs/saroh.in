import { ModuleReadinessRegistry } from "./module-readiness.registry";

/** Build a fake Prisma whose every `<model>.count` returns counts[model] ?? 0. */
function dbWith(counts: Record<string, number>) {
    const model = (name: string) => ({
        count: jest.fn().mockResolvedValue(counts[name] ?? 0),
    });
    return {
        publication: model("publication"),
        site: model("site"),
        pipeline: model("pipeline"),
        service: model("service"),
        availabilityRule: model("availabilityRule"),
        store: model("store"),
        product: model("product"),
        order: model("order"),
        merchantPaymentProvider: model("merchantPaymentProvider"),
        communicationProvider: model("communicationProvider"),
        automationRule: model("automationRule"),
        analyticsEvent: model("analyticsEvent"),
        analyticsDailyAggregate: model("analyticsDailyAggregate"),
    } as never;
}

const input = { organizationId: "org_1" };

function registry(counts: Record<string, number>) {
    return new ModuleReadinessRegistry(dbWith(counts));
}

describe("ModuleReadinessRegistry", () => {
    it("Website: no site → setup; publication → active", async () => {
        expect(
            (await registry({}).evaluate("WEBSITE", input)).blockers[0].code,
        ).toBe("WEBSITE_NO_SITE");
        expect(
            (await registry({ site: 1 }).evaluate("WEBSITE", input)).blockers[0]
                .code,
        ).toBe("WEBSITE_NO_PUBLICATION");
        expect(
            (await registry({ publication: 1 }).evaluate("WEBSITE", input))
                .readiness,
        ).toBe("ACTIVE");
    });

    it("CRM: pipeline required for ACTIVE", async () => {
        expect((await registry({}).evaluate("CRM", input)).readiness).toBe(
            "SETUP_REQUIRED",
        );
        expect(
            (await registry({ pipeline: 1 }).evaluate("CRM", input)).readiness,
        ).toBe("ACTIVE");
    });

    it("Appointments: needs a service then availability", async () => {
        expect(
            (await registry({}).evaluate("APPOINTMENTS", input)).blockers[0]
                .code,
        ).toBe("APPOINTMENTS_NO_SERVICE");
        expect(
            (await registry({ service: 1 }).evaluate("APPOINTMENTS", input))
                .blockers[0].code,
        ).toBe("APPOINTMENTS_NO_AVAILABILITY");
        expect(
            (
                await registry({ service: 1, availabilityRule: 1 }).evaluate(
                    "APPOINTMENTS",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Payments: provider required", async () => {
        expect(
            (await registry({}).evaluate("PAYMENTS", input)).blockers[0].code,
        ).toBe("PAYMENTS_NO_PROVIDER");
        expect(
            (
                await registry({ merchantPaymentProvider: 1 }).evaluate(
                    "PAYMENTS",
                    input,
                )
            ).readiness,
        ).toBe("ACTIVE");
    });

    it("Commerce: open orders block a full disable", async () => {
        expect(
            await registry({}).deactivationBlockers("COMMERCE", input),
        ).toEqual([]);
        const blockers = await registry({ order: 3 }).deactivationBlockers(
            "COMMERCE",
            input,
        );
        expect(blockers[0].code).toBe("COMMERCE_OPEN_ORDERS");
    });

    it("other modules have no deactivation blockers by default", async () => {
        expect(await registry({}).deactivationBlockers("CRM", input)).toEqual(
            [],
        );
        expect(
            await registry({}).deactivationBlockers("WEBSITE", input),
        ).toEqual([]);
    });
});
