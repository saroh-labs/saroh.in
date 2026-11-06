// Workspace events (DEC-209): sent on every action, not only the first,
// with the plan and kind and nothing of a customer's. Fake transport.
jest.mock("posthog-node", () => ({ PostHog: class {} }));

import type { TelemetryTransport } from "../../common/observability/posthog";
import { setTelemetry } from "../../common/observability/posthog";
import { ActivationEvents } from "./activation-events";
import type { AnalyticsService } from "./analytics.service";
import {
    forgetWorkspaceFacts,
    PRODUCT_EVENTS,
    WORKSPACE_EVENTS,
    workspaceAction,
} from "./product-milestones";

const ORG = "org_1";
const settle = () => new Promise((resolve) => setImmediate(resolve));

function transport() {
    return {
        capture: jest.fn(),
        captureException: jest.fn(),
        shutdown: jest.fn().mockResolvedValue(undefined),
    } satisfies TelemetryTransport;
}

const facts = (isDemo = false) =>
    jest.fn().mockResolvedValue({
        planKey: "grow",
        businessKind: "BUSINESS",
        isDemo,
        signupSource: null,
        referrerCode: null,
        managerCode: null,
    });

describe("workspace events (DEC-209)", () => {
    beforeEach(() => forgetWorkspaceFacts());
    afterEach(() => setTelemetry(null));

    it("are on the closed list", () => {
        for (const e of WORKSPACE_EVENTS) expect(PRODUCT_EVENTS).toContain(e);
    });

    it("sends nothing with PostHog off", async () => {
        const read = facts();
        workspaceAction("product_created", ORG, {}, read);
        await settle();
        expect(read).not.toHaveBeenCalled();
    });

    it("sends each time, with plan and kind, reading the business once", async () => {
        const t = transport();
        setTelemetry({ transport: t, environment: "production" } as never);
        const read = facts();
        workspaceAction(
            "module_turned_on",
            ORG,
            { module_key: "BOOKINGS" },
            read,
        );
        workspaceAction(
            "module_turned_on",
            ORG,
            { module_key: "BOOKINGS" },
            read,
        );
        await settle();
        expect(t.capture).toHaveBeenCalledTimes(2);
        expect(read).toHaveBeenCalledTimes(1);
        expect(t.capture.mock.calls[0][0]).toMatchObject({
            distinctId: ORG,
            event: "module_turned_on",
            properties: {
                module_key: "BOOKINGS",
                plan_key: "grow",
                business_kind: "BUSINESS",
            },
        });
    });

    it("drops any property not on its list", async () => {
        const t = transport();
        setTelemetry({ transport: t, environment: "production" } as never);
        workspaceAction(
            "customer_created",
            ORG,
            { name: "Priya Sharma" } as never,
            facts(),
        );
        await settle();
        expect(t.capture.mock.calls[0][0].properties).not.toHaveProperty(
            "name",
        );
    });

    it("sends nothing for a demo business", async () => {
        const t = transport();
        setTelemetry({ transport: t, environment: "production" } as never);
        workspaceAction("order_created", ORG, {}, facts(true));
        await settle();
        expect(t.capture).not.toHaveBeenCalled();
    });

    it("fires from every ledger call, even when the ledger keeps only the first", async () => {
        const t = transport();
        setTelemetry({ transport: t, environment: "production" } as never);
        const ledger = {
            record: jest.fn().mockResolvedValue({ id: "e", deduped: true }),
        } as unknown as AnalyticsService;
        const events = new ActivationEvents(ledger);
        // The real facts read would touch the database: prime the cache.
        workspaceAction("product_created", ORG, {}, facts());
        await settle();
        t.capture.mockClear();
        await events.firstProductCreated(ORG, "p1");
        await events.firstProductCreated(ORG, "p2");
        await settle();
        expect(t.capture.mock.calls.map((c) => c[0].event)).toEqual([
            "product_created",
            "product_created",
        ]);
        expect(JSON.stringify(t.capture.mock.calls)).not.toContain("p1");
    });
});
