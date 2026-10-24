// The product milestones (DEC-125): what is sent, once, and what never is.
// The ledger is a fake that dedupes as the real one does; PostHog is a fake
// transport. No database, no network.
jest.mock("posthog-node", () => ({ PostHog: class {} }));

import { scrubContext } from "@saroh/error-tracking";

import { structuredLogger } from "../../common/logging/structured-logger";
import type { TelemetryTransport } from "../../common/observability/posthog";
import { setTelemetry } from "../../common/observability/posthog";
import { ActivationEvents } from "./activation-events";
import type { AnalyticsService, RecordEventInput } from "./analytics.service";
import { ACTIVATION_TYPES } from "./event-contract";
import {
    FUNNEL_EVENTS,
    MILESTONE_BY_LEDGER_TYPE,
    PRODUCT_EVENTS,
    PRODUCT_MILESTONES,
    ProductMilestones,
    UPGRADE_PROMPT_EVENTS,
    signedUp,
    signupViewProperties,
    sourceProperties,
} from "./product-milestones";

const ORG = "org_1";

/** The keys where a business or account came from; each only when it has one. */
const SOURCE_KEYS = [
    "src",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "referrer_code",
    "manager_code",
];

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
    const facts = jest.fn().mockResolvedValue({
        planKey: "free",
        businessKind: "BUSINESS",
        signupSource: null,
        referrerCode: null,
        managerCode: null,
    });
    milestones.facts = facts;
    const events = new ActivationEvents(fakeLedger(), milestones);
    return { transport, milestones, events, facts };
}

/** Let the fire-and-forget read and send finish. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("product milestones (DEC-125)", () => {
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
        // The events with their own send path (DEC-187), none a milestone.
        expect([...FUNNEL_EVENTS]).toEqual(["signup_page_viewed"]);
    });

    it("keeps every sign-up view key through the scrubber's drop pattern", () => {
        const properties = signupViewProperties({
            src: "a",
            utm_source: "b",
            utm_medium: "c",
            utm_campaign: "d",
            plan: "grow",
            cycle: "year",
            referral_channel: "both",
        });
        expect(scrubContext(properties)).toEqual(properties);
        expect(Object.keys(properties)).toHaveLength(7);
    });

    it("grows the closed list by exactly the two prompt events (DEC-187), neither from the ledger", () => {
        expect([...PRODUCT_EVENTS].sort()).toEqual(
            [
                ...PRODUCT_MILESTONES,
                "upgrade_prompt_shown",
                "upgrade_prompt_pressed",
            ].sort(),
        );
        for (const event of UPGRADE_PROMPT_EVENTS)
            expect(Object.values(MILESTONE_BY_LEDGER_TYPE)).not.toContain(
                event,
            );
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
                referral_channel: "none",
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
        signedUp("user_1", "saroh_src=src=home_hero; saroh_ref=ab2cd3ef");
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

    it("says where a business came from and who referred it (DEC-187)", async () => {
        const { transport, events, facts } = build();
        setTelemetry({ transport, environment: "production" });
        facts.mockResolvedValueOnce({
            planKey: "free",
            businessKind: "BUSINESS",
            signupSource: {
                src: "home_hero",
                utmSource: "google",
                utmMedium: "cpc",
                utmCampaign: "launch-oct",
            },
            referrerCode: "ab2cd3ef",
            managerCode: "AB2CD3EF",
        });
        await events.firstSitePublished(ORG, "site_1");
        await settle();
        // Sent through the real scrubber (`captureProductEvent`): every key
        // and value comes out as it went in.
        expect(transport.capture).toHaveBeenCalledWith({
            distinctId: ORG,
            event: "site_published",
            properties: {
                plan_key: "free",
                business_kind: "BUSINESS",
                src: "home_hero",
                utm_source: "google",
                utm_medium: "cpc",
                utm_campaign: "launch-oct",
                referral_channel: "both",
                referrer_code: "ab2cd3ef",
                manager_code: "AB2CD3EF",
                app: "api",
                environment: "production",
                $process_person_profile: false,
            },
        });
    });

    it("says referral_channel none, and no source or code, for a business that has none", async () => {
        const { transport, events } = build();
        setTelemetry({ transport, environment: "production" });
        await events.firstSitePublished(ORG, "site_1");
        await settle();
        const [[{ properties }]] = transport.capture.mock.calls as [
            [{ properties: Record<string, unknown> }],
        ];
        expect(properties.referral_channel).toBe("none");
        for (const key of SOURCE_KEYS)
            expect(properties).not.toHaveProperty(key);
    });

    it("keeps every source key through the scrubber's drop pattern", () => {
        const kept = scrubContext(
            sourceProperties({
                signupSource: {
                    src: "a",
                    utmSource: "b",
                    utmMedium: "c",
                    utmCampaign: "d",
                },
                referrerCode: "ab2cd3ef",
                managerCode: "AB2CD3EF",
            }),
        );
        expect(Object.keys(kept).sort()).toEqual(
            [...SOURCE_KEYS, "referral_channel"].sort(),
        );
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
        release({
            planKey: "pro",
            businessKind: "BUSINESS",
            signupSource: null,
            referrerCode: null,
            managerCode: null,
        });
        await settle();
        expect(transport.capture).toHaveBeenCalledTimes(1);
    });

    it("sends signed_up for the user's id, with no plan, kind or personal detail", () => {
        const { transport } = build();
        setTelemetry({ transport, environment: "production" });
        signedUp("user_1", null);
        expect(transport.capture).toHaveBeenCalledWith({
            distinctId: "user_1",
            event: "signed_up",
            properties: {
                referral_channel: "none",
                app: "api",
                environment: "production",
                $process_person_profile: false,
            },
        });
    });

    describe("signed_up reads where the person came from in the sign-up's cookies", () => {
        function sentProperties(cookie: string | null) {
            const { transport } = build();
            setTelemetry({ transport, environment: "production" });
            signedUp("user_1", cookie);
            const [[{ properties }]] = transport.capture.mock.calls as [
                [{ properties: Record<string, unknown> }],
            ];
            return properties;
        }

        it("sends the kept src, utm and both codes", () => {
            expect(
                sentProperties(
                    "theme=dark; saroh_src=src=home_hero&utm_source=google&utm_campaign=launch; saroh_ref=ab2cd3ef; saroh_am=AB2CD3EF.1790000000",
                ),
            ).toMatchObject({
                src: "home_hero",
                utm_source: "google",
                utm_campaign: "launch",
                referral_channel: "both",
                referrer_code: "ab2cd3ef",
                manager_code: "AB2CD3EF",
            });
        });

        it("sends a manager's code alone as account_manager", () => {
            expect(
                sentProperties("saroh_am=AB2CD3EF.1790000000"),
            ).toMatchObject({
                referral_channel: "account_manager",
                manager_code: "AB2CD3EF",
            });
        });

        it("sends no source with no cookie", () => {
            for (const cookie of [null, "theme=dark"]) {
                const properties = sentProperties(cookie);
                expect(properties.referral_channel).toBe("none");
                for (const key of SOURCE_KEYS)
                    expect(properties).not.toHaveProperty(key);
            }
        });

        it("drops a malformed value and keeps the rest", () => {
            const properties = sentProperties(
                "saroh_src=src=%3Cb%3E&utm_source=google; saroh_ref=not-a-code!; saroh_am=lol",
            );
            expect(properties).toMatchObject({
                utm_source: "google",
                referral_channel: "none",
            });
            for (const key of ["src", "referrer_code", "manager_code"])
                expect(properties).not.toHaveProperty(key);
            // A broken escape is no source at all, not a failed sign-up.
            expect(sentProperties("saroh_src=src=%E0%A4%A")).toEqual(
                expect.objectContaining({ referral_channel: "none" }),
            );
        });
    });
});
