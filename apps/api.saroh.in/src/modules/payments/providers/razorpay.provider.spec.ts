// Network-free: `fetch` is replaced per test, so what goes to Razorpay and
// how each answer is read are both asserted without a live call.
import { RefundCallError } from "./provider.port";
import { RazorpayProvider } from "./razorpay.provider";

const CREDS = { keyId: "rzp_key", keySecret: "rzp_secret" };
const INPUT = {
    reference: "cmrefund00000000000000001",
    providerIntentId: "order_rzp_1",
    providerPaymentRef: "pay_rzp_1",
    amountCents: 25000,
    currency: "INR",
    credentials: CREDS,
};

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
});

function answer(status: number, body: unknown = {}) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

async function refused(p: Promise<unknown>) {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefundCallError);
    return (err as RefundCallError).outcome;
}

describe("RazorpayProvider.refund", () => {
    it("sends Saroh's reference as the idempotency key, the receipt and a note", async () => {
        fetchMock.mockReturnValue(
            answer(200, { id: "rfnd_1", status: "pending" }),
        );

        const result = await new RazorpayProvider().refund(INPUT);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://api.razorpay.com/v1/payments/pay_rzp_1/refund",
        );
        expect(
            (init.headers as Record<string, string>)["X-Refund-Idempotency"],
        ).toBe(INPUT.reference);
        expect(JSON.parse(init.body as string)).toEqual({
            amount: 25000,
            receipt: INPUT.reference,
            notes: { saroh_refund_id: INPUT.reference },
        });
        expect(result).toEqual({
            providerRefundId: "rfnd_1",
            status: "pending",
            failed: false,
        });
    });

    it("sends the same header and body on a retry", async () => {
        fetchMock.mockImplementation(() => answer(200, { id: "rfnd_1" }));
        const provider = new RazorpayProvider();

        await provider.refund(INPUT);
        await provider.refund(INPUT);

        const [first, second] = fetchMock.mock.calls as [string, RequestInit][];
        expect(second[1].body).toBe(first[1].body);
        expect(second[1].headers).toEqual(first[1].headers);
    });

    it.each([409, 429, 500, 503])(
        "HTTP %i may have refunded — UNKNOWN",
        async (status) => {
            fetchMock.mockReturnValue(answer(status));
            expect(await refused(new RazorpayProvider().refund(INPUT))).toBe(
                "UNKNOWN",
            );
        },
    );

    it("a network error may have refunded — UNKNOWN", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await refused(new RazorpayProvider().refund(INPUT))).toBe(
            "UNKNOWN",
        );
    });

    it("HTTP 400 made no refund — REFUSED", async () => {
        fetchMock.mockReturnValue(answer(400));
        expect(await refused(new RazorpayProvider().refund(INPUT))).toBe(
            "REFUSED",
        );
    });

    it("no payment id is REFUSED without a call", async () => {
        expect(
            await refused(
                new RazorpayProvider().refund({
                    ...INPUT,
                    providerPaymentRef: null,
                }),
            ),
        ).toBe("REFUSED");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never puts the secret in the error", async () => {
        fetchMock.mockReturnValue(answer(401, { error: CREDS.keySecret }));
        const err = await new RazorpayProvider()
            .refund(INPUT)
            .catch((e: Error) => e);
        expect((err as Error).message).not.toContain(CREDS.keySecret);
    });
});

describe("RazorpayProvider.findRefund", () => {
    it("matches the payment's refund by receipt, never by amount", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                items: [
                    // Same amount, made in the dashboard — not ours.
                    { id: "rfnd_other", status: "processed", notes: [] },
                    {
                        id: "rfnd_ours",
                        status: "processed",
                        receipt: INPUT.reference,
                    },
                ],
            }),
        );

        const found = await new RazorpayProvider().findRefund(INPUT);

        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api.razorpay.com/v1/payments/pay_rzp_1/refunds?count=100",
        );
        expect(found).toEqual({
            providerRefundId: "rfnd_ours",
            status: "processed",
            failed: false,
        });
    });

    it("matches by the note when the receipt is missing", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                items: [
                    {
                        id: "rfnd_ours",
                        status: "failed",
                        notes: { saroh_refund_id: INPUT.reference },
                    },
                ],
            }),
        );
        await expect(new RazorpayProvider().findRefund(INPUT)).resolves.toEqual(
            { providerRefundId: "rfnd_ours", status: "failed", failed: true },
        );
    });

    it("is null when the payment has no such refund", async () => {
        fetchMock.mockReturnValue(answer(200, { items: [] }));
        await expect(
            new RazorpayProvider().findRefund(INPUT),
        ).resolves.toBeNull();
    });

    it("is UNKNOWN when Razorpay cannot answer", async () => {
        fetchMock.mockReturnValue(answer(502));
        expect(await refused(new RazorpayProvider().findRefund(INPUT))).toBe(
            "UNKNOWN",
        );
    });
});
