import { isKeysRefused } from "../../../common/providers/provider-attention";
import { WhatsappCommsProvider } from "./whatsapp.provider";

// Review 04 H4: the merchant's own Meta token is checked on connect, and a
// revoked one flags the connection. `fetch` is stubbed: no network.
describe("WhatsappCommsProvider keys", () => {
    const fetchMock = jest.fn();
    const realFetch = global.fetch;
    const answer = (status: number, body: unknown = {}) =>
        fetchMock.mockResolvedValue({
            ok: status < 300,
            status,
            json: () => Promise.resolve(body),
        });
    const credentials = { accessToken: "EAAtest", phoneNumberId: "123" };

    beforeEach(() => {
        fetchMock.mockReset();
        global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterAll(() => {
        global.fetch = realFetch;
    });

    it("accepts a token Meta answers for", async () => {
        answer(200, { id: "123" });
        await expect(
            new WhatsappCommsProvider().verifyCredentials({
                provider: "META",
                credentials,
            }),
        ).resolves.toBe("ACCEPTED");
    });

    it("rejects an expired token (Meta's 400 code 190)", async () => {
        answer(400, { error: { code: 190 } });
        await expect(
            new WhatsappCommsProvider().verifyCredentials({
                provider: "META",
                credentials,
            }),
        ).resolves.toBe("REJECTED");
    });

    // 07 F12: a token that may send but not read the number answers 10 or
    // 200; it is a working token, not a refused one.
    it.each([
        [403, 10],
        [403, 200],
        [400, 200],
    ])(
        "accepts a send-only token (HTTP %i, Meta code %i)",
        async (status, code) => {
            answer(status, { error: { code } });
            await expect(
                new WhatsappCommsProvider().verifyCredentials({
                    provider: "META",
                    credentials,
                }),
            ).resolves.toBe("ACCEPTED");
        },
    );

    it("is unsure when Meta is down", async () => {
        answer(503);
        await expect(
            new WhatsappCommsProvider().verifyCredentials({
                provider: "META",
                credentials,
            }),
        ).resolves.toBe("UNSURE");
    });

    it("a send Meta refuses for the token throws keys-refused", async () => {
        answer(401, { error: { code: 190 } });
        const err = await new WhatsappCommsProvider()
            .send({ to: "919800000000", body: "hi", credentials })
            .catch((e: unknown) => e);
        expect(isKeysRefused(err)).toBe(true);
    });

    it("any other refusal is a plain failure", async () => {
        answer(400, { error: { code: 131047 } });
        const err = await new WhatsappCommsProvider()
            .send({ to: "919800000000", body: "hi", credentials })
            .catch((e: unknown) => e);
        expect(isKeysRefused(err)).toBe(false);
    });
});
