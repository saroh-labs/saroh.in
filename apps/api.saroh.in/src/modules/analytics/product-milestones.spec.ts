// The product milestones (DEC-123): what is sent, once, and what never is.
// The ledger is a fake that dedupes as the real one does; PostHog is a fake
// transport. No database, no network.
jest.mock("posthog-node", () => ({ PostHog: class {} }));

import { structuredLogger } from "../../common/logging/structured-logger";
import type { TelemetryTransport } from "../../common/observability/posthog";
import { setTelemetry } from "../../common/observability/posthog";
import { ActivationEvents } from "./activation-events";
import type { AnalyticsService, RecordEventInput } from "./analytics.service";
import { ACTIVATION_TYPES } from "./event-contract";
import {
    MILESTONE_BY_LEDGER_TYPE,
    PRODUCT_MILESTONES,
    ProductMilestones,
    signedUp,
} from "./product-milestones";

const ORG = "org_1";

/** A ledger that stores a `dedupeKey` once, as `AnalyticsService.record` does. */
function fakeLedger() {
    const keys = new Set<string>();
    const record = jest.fn((input: RecordEventInput) => {
        const key = `${input.organizationId}|${input.dedupeKey ?? Math.random()}`;
        const deduped = keys.has(key);
        keys.add(key);
        return Promise.resolve({ id: "evt", deduped });
    });
    return { record } as unknown as AnalyticsService;
}

function build() {
    const transport = {
        capture: jest.fn(),
        captureException: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
    } satisfies TelemetryTransport;
    const milestones = new ProductMilestones();
    const facts = jest
        .fn()
        .mockResolvedValue({ planKey: "free", businessKind: "BUSINESS" });
    milestones.facts = facts;
    const events = new ActivationEvents(fakeLedger(), milestones);
    return { transport, milestones, events, facts };
}

/** Let the fire-and-forget read and send finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("product milestones (DEC-123)", () => {
    beforeEach(() => {
        jest.spyOn(structuredLogger, "warn").mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => {
        setTelemetry(null);
        jest.restoreAllMocks();
    });

    it("is exactly the nine events, each with a source", () => {
        expect([...PRODUCT_MILESTONES].sort()).toEqual(
            [
                "signed_up",
                "onboarding_finished",
                "first_product_added",
                "first_service_added",
                "site_published",
                "first_order_taken",
                "first_booking_taken",
                "payment_provider_connected",
                "plan_upgraded",
            ].sort(),
        );
        // Every business milestone comes from one ledger type; signed_up
        // comes from the user's row being written.
        expect(Object.values(MILESTONE_BY_LEDGER_TYPE).sort()).toEqual(
            PRODUCT_MILESTONES.filter((m) => m !== "signed_up").sort(),
        );
        for (const type of Object.keys(MILESTONE_BY_LEDGER_TYPE))
            expect(ACTIVATION_TYPES).toContain(type);
    });

    it("sends each milestone once per business, however often its fact repeats", async () => {
        const { transport, events } = build();
        setTelemetry({ transport, environment: "production" });

        for (let i = 0; i < 3; i++) {
            await events.organizationCreated(ORG);
            await events.firstProductCreated(ORG, `product_${i}`);
            await events.firstServiceCreated(ORG, `service_${i}`);
            await events.firstSitePublished(ORG, `site_${i}`);
            await events.firstOrderCreated(ORG, `order_${i}`);
            await events.firstBookingCreated(ORG, `booking_${i}`);
            await events.firstPaymentProviderConnected(ORG, "RAZORPAY");
            await events.firstPlanUpgraded(ORG, "pro");
        }
        await settle();

        const sent = transport.capture.mock.calls.map(
            ([message]: [{ event: string }]) => message.event,
        );
        expect(sent.sort()).toEqual(
            PRODUCT_MILESTONES.filter((m) => m !== "signed_up").sort(),
        );
    });

    it("sends it again for another business, and only for that one", async () => {
        const { transport, events } = build();
        setTelemetry({ transport, environment: "production" });
        await events.firstOrderCreated("org_a", "o1");
        await events.firstOrderCreated("org_b", "o2");
        await events.firstOrderCreated("org_a", "o3");
        await settle();
        expect(
            transport.capture.mock.calls.map(
                ([message]: [{ distinctId: string }]) => message.distinctId,
            ),
        ).toEqual(["org_a", "org_b"]);
    });

    it("says the plan's key, the business's kind and the environment, and nothing personal", async () => {
        const { transport, events } = build();
        setTelemetry({ transport, environment: "development" });
        await events.firstOrderCreated(ORG, "order_1");
        await settle();
        expect(transport.capture).toHaveBeenCalledWith({
            distinctId: ORG,
            event: "first_order_taken",
            properties: {
                plan_key: "free",
                business_kind: "BUSINESS",
                app: "api",
                environment: "development",
                $process_person_profile: false,
            },
        });
        // Not even the order's id: the ledger keeps that, PostHog doesn't.
        expect(JSON.stringify(transport.capture.mock.calls)).not.toContain(
            "order_1",
        );
    });

    it("sends nothing for ledger rows that are not milestones", async () => {
        const { transport, events } = build();
        setTelemetry({ transport, environment: "production" });
        await events.firstCustomerCreated(ORG, "customer_1");
        await events.moduleEnabled(ORG, "COMMERCE");
        await events.onboardingCompleted(ORG, 2);
        await events.importCompleted(ORG, {
            entity: "products",
            created: 1,
            updated: 0,
            failed: 0,
        });
        await settle();
        expect(transport.capture).not.toHaveBeenCalled();
    });

    it("reads and sends nothing with PostHog off", async () => {
        const { transport, events, facts } = build();
        await events.firstOrderCreated(ORG, "order_1");
        signedUp("user_1");
        await settle();
        expect(facts).not.toHaveBeenCalled();
        expect(transport.capture).not.toHaveBeenCalled();
    });

    it("never holds up or fails the write when the read or PostHog fails", async () => {
        const { transport, events, facts } = build();
        setTelemetry({ transport, environment: "production" });
        facts.mockRejectedValueOnce(new Error("db down"));
        await expect(
            events.firstOrderCreated(ORG, "order_1"),
        ).resolves.toBeUndefined();
        transport.capture.mockImplementation(() => {
            throw new Error("posthog down");
        });
        await expect(
            events.firstBookingCreated(ORG, "booking_1"),
        ).resolves.toBeUndefined();
        await settle();
    });

    it("returns before the plan is read: the caller never waits for it", async () => {
        const { transport, events, facts } = build();
        setTelemetry({ transport, environment: "production" });
        let release: (value: unknown) => void = () => undefined;
        facts.mockReturnValueOnce(
            new Promise((resolve) => {
                release = resolve;
            }),
        );
        await events.firstOrderCreated(ORG, "order_1");
        expect(transport.capture).not.toHaveBeenCalled();
        release({ planKey: "pro", businessKind: "BUSINESS" });
        await settle();
        expect(transport.capture).toHaveBeenCalledTimes(1);
    });

    it("sends signed_up for the user's id, with no plan, kind or personal detail", () => {
        const { transport } = build();
        setTelemetry({ transport, environment: "production" });
        signedUp("user_1");
        expect(transport.capture).toHaveBeenCalledWith({
            distinctId: "user_1",
            event: "signed_up",
            properties: {
                app: "api",
                environment: "production",
                $process_person_profile: false,
            },
        });
    });
});
