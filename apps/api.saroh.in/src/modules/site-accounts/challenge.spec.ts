import { ChallengeVerifier } from "./challenge";

/** Turnstile's answer, without the network. */
class Keyed extends ChallengeVerifier {
    protected override readonly secretKey = "test-secret";
}

const answer = (body: object) =>
    jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(JSON.stringify(body)));

afterEach(() => jest.restoreAllMocks());

/** A token solved elsewhere buys no Saroh account code (owner, 18 Nov). */
describe("ChallengeVerifier.verify with hostnames", () => {
    const verifier = new Keyed();

    it("takes a token solved on one of the hostnames", async () => {
        answer({ success: true, hostname: "accounts.example.test" });
        await expect(
            verifier.verify("tok", "", ["accounts.example.test"]),
        ).resolves.toBe(true);
    });

    it("refuses a passing token solved anywhere else, or with no hostname", async () => {
        for (const body of [
            { success: true, hostname: "shop.example.test" },
            { success: true },
        ]) {
            answer(body);
            await expect(
                verifier.verify("tok", "", ["accounts.example.test"]),
            ).resolves.toBe(false);
        }
    });

    it("refuses with no hostnames to match: nothing configured", async () => {
        answer({ success: true, hostname: "accounts.example.test" });
        await expect(verifier.verify("tok", "", [])).resolves.toBe(false);
    });

    it("asks nothing of the hostname when not told any (merchant sites)", async () => {
        answer({ success: true, hostname: "shop.example.test" });
        await expect(verifier.verify("tok", "")).resolves.toBe(true);
    });

    it("still refuses a failed token on a right hostname", async () => {
        answer({ success: false, hostname: "accounts.example.test" });
        await expect(
            verifier.verify("tok", "", ["accounts.example.test"]),
        ).resolves.toBe(false);
    });
});
