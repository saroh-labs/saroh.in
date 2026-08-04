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

/**
 * A provider-aware fake. The fake above ignores `where`, so it cannot express
 * the state that mattered here: providers exist, none of them are connected.
 */
function dbWithProviders(opts: {
    payments?: { total: number; connected: number };
    communications?: { total: number; connected: number };
}) {
    const provider = (counts?: { total: number; connected: number }) => ({
        count: jest.fn((args?: { where?: { status?: string } }) =>
            Promise.resolve(
                args?.where?.status === "CONNECTED"
                    ? (counts?.connected ?? 0)
                    : (counts?.total ?? 0),
            ),
        ),
    });
    return {
        merchantPaymentProvider: provider(opts.payments),
        communicationProvider: provider(opts.communications),
    } as never;
}

describe("provider readiness reflects provider STATUS, not row count", () => {
    it.each([
        ["PAYMENTS", "payments"],
        ["COMMUNICATIONS", "communications"],
    ] as const)(
        "%s: a connected provider is ACTIVE",
        async (moduleKey, field) => {
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({ [field]: { total: 2, connected: 1 } }),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("ACTIVE");
            expect(result.blockers).toEqual([]);
        },
    );

    it.each([
        ["PAYMENTS", "payments", "PAYMENTS_PROVIDER_DISABLED"],
        [
            "COMMUNICATIONS",
            "communications",
            "COMMUNICATIONS_PROVIDER_DISABLED",
        ],
    ] as const)(
        "%s: providers present but all disabled is ATTENTION_REQUIRED",
        async (moduleKey, field, code) => {
            // The defect: this used to read ACTIVE because a row existed, while
            // provider-health reported DEGRADED for the same row. A merchant was
            // told Payments was active while unable to take a payment.
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({ [field]: { total: 1, connected: 0 } }),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("ATTENTION_REQUIRED");
            expect(result.blockers[0]?.code).toBe(code);
            expect(result.blockers[0]?.severity).toBe("ATTENTION");
            expect(result.blockers[0]?.actionHref).toBe("/settings/providers");
        },
    );

    it.each([
        ["PAYMENTS", "PAYMENTS_NO_PROVIDER"],
        ["COMMUNICATIONS", "COMMUNICATIONS_NO_PROVIDER"],
    ] as const)(
        "%s: no provider at all stays SETUP_REQUIRED, a different situation",
        async (moduleKey, code) => {
            // "You have not connected this yet" is not the same as "the thing
            // you connected has stopped working", and must not share copy.
            const result = await new ModuleReadinessRegistry(
                dbWithProviders({}),
            ).evaluate(moduleKey, input);

            expect(result.readiness).toBe("SETUP_REQUIRED");
            expect(result.blockers[0]?.code).toBe(code);
            expect(result.blockers[0]?.severity).toBe("SETUP");
        },
    );

    it("makes ATTENTION_REQUIRED reachable at all", async () => {
        // Before this change no adapter emitted severity ATTENTION, so the
        // state was one the types allowed, the UI rendered, and the product
        // could never produce — and no fixture could create it to review.
        const result = await new ModuleReadinessRegistry(
            dbWithProviders({ payments: { total: 3, connected: 0 } }),
        ).evaluate("PAYMENTS", input);

        expect(result.readiness).toBe("ATTENTION_REQUIRED");
    });
});
