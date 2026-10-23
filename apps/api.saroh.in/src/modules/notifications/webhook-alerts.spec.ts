import { wordWebhook } from "./webhook-alerts";

function txWith(row: Record<string, unknown> | null) {
    return {
        webhookEvent: { findFirst: jest.fn().mockResolvedValue(row) },
    } as never;
}

describe("a provider's event Saroh couldn't apply, told to the team", () => {
    it("says what it was about and where to check, on the Payment failed row", async () => {
        const worded = await wordWebhook(
            txWith({
                id: "wh_1",
                provider: "RAZORPAY",
                eventType: "refund.processed",
                status: "FAILED",
            }),
            "org_1",
            { event: "webhook", webhookEventId: "wh_1" },
        );
        expect(worded).toMatchObject({
            event: "failed",
            eventKey: "team:webhook:wh_1",
            title: "A refund update from Razorpay isn't in Saroh yet",
            path: "/settings/providers",
        });
        expect(worded?.body).toContain("Saroh's team has been told");
    });

    it("says nothing once the delivery was replayed, or isn't this business's", async () => {
        const replayed = txWith({
            id: "wh_1",
            provider: "RAZORPAY",
            eventType: "payment.captured",
            status: "PROCESSED",
        });
        await expect(
            wordWebhook(replayed, "org_1", {
                event: "webhook",
                webhookEventId: "wh_1",
            }),
        ).resolves.toBeNull();
        await expect(
            wordWebhook(txWith(null), "org_1", {
                event: "webhook",
                webhookEventId: "wh_1",
            }),
        ).resolves.toBeNull();
    });
});
