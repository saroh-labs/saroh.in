jest.mock("@saroh/database", () => {
    const prisma = {
        webhookEvent: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

import { prisma } from "@saroh/database";

import type { PaymentsService } from "../payments/payments.service";
import type { WebhookProviderFactory } from "./providers/webhook-provider.factory";
import { WebhooksService } from "./webhooks.service";

const find = prisma.webhookEvent.findUnique as jest.Mock;
const claim = prisma.webhookEvent.updateMany as jest.Mock;
const update = prisma.webhookEvent.update as jest.Mock;

function build() {
    const provider = {
        name: "fake",
        parseEvent: jest.fn(() => ({
            providerEventId: "evt_1",
            eventType: "payment.ignored",
            outcome: "IGNORED",
        })),
    };
    const factory = {
        get: jest.fn(() => provider),
    } as unknown as WebhookProviderFactory;
    return {
        service: new WebhooksService(factory, {} as PaymentsService),
        provider,
    };
}

const stored = {
    id: "wh_1",
    provider: "fake",
    organizationId: "org_1",
    payload: { event: "payment.ignored" },
    status: "FAILED",
};

beforeEach(() => jest.clearAllMocks());

describe("WebhooksService.replay", () => {
    it("replays a failed delivery from its stored, verified payload", async () => {
        find.mockResolvedValue(stored);
        claim.mockResolvedValue({ count: 1 });
        const { service, provider } = build();

        await expect(service.replay("wh_1")).resolves.toEqual({
            status: "ignored",
        });
        expect(provider.parseEvent).toHaveBeenCalledWith({
            payload: stored.payload,
            headers: {},
        });
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: "IGNORED" }),
            }),
        );
    });

    it.each(["PROCESSED", "IGNORED", "RECEIVED"])(
        "never replays a %s delivery, which could apply a payment twice",
        async (status) => {
            find.mockResolvedValue({ ...stored, status });
            const { service } = build();
            await expect(service.replay("wh_1")).resolves.toEqual(
                expect.objectContaining({ status: "skipped" }),
            );
            expect(claim).not.toHaveBeenCalled();
        },
    );

    it("loses cleanly when another replay claimed it first", async () => {
        find.mockResolvedValue(stored);
        claim.mockResolvedValue({ count: 0 });
        const { service, provider } = build();
        await expect(service.replay("wh_1")).resolves.toEqual(
            expect.objectContaining({ status: "skipped" }),
        );
        expect(provider.parseEvent).not.toHaveBeenCalled();
    });

    it("records a replay that fails again as failed, with why", async () => {
        find.mockResolvedValue(stored);
        claim.mockResolvedValue({ count: 1 });
        const { service, provider } = build();
        provider.parseEvent.mockImplementation(() => {
            throw new Error("unknown event shape");
        });
        await expect(service.replay("wh_1")).resolves.toEqual({
            status: "failed",
            detail: "unknown event shape",
        });
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "FAILED",
                    error: "unknown event shape",
                }),
            }),
        );
    });
});
