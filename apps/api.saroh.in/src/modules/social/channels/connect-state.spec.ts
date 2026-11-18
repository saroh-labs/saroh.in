import { randomBytes } from "node:crypto";

import { env } from "../../../env";
import { signState, STATE_TTL_MS, verifyState } from "./connect-state";
import { seal, SocialSealMismatchError, unseal } from "./sealing";

/**
 * The consent's signed state and the sealed tokens (U4): only Saroh can
 * make a state, it is good for 10 minutes and one channel, and a token
 * opens only on the row it was sealed for.
 */
const mutableEnv = env as { SOCIAL_ENC_KEY?: string };
const before = mutableEnv.SOCIAL_ENC_KEY;

beforeEach(() => {
    mutableEnv.SOCIAL_ENC_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
    mutableEnv.SOCIAL_ENC_KEY = before;
});

const who = {
    organizationId: "org_1",
    userId: "user_1",
    kind: "INSTAGRAM" as const,
};

describe("the consent's state", () => {
    it("names who started it, for the channel it was made for", () => {
        const now = new Date("2026-11-18T10:00:00Z");
        const state = signState(who, now);
        expect(verifyState(state, "INSTAGRAM", now)).toMatchObject(who);
        expect(verifyState(state, "THREADS", now)).toBe("invalid");
    });

    it("refuses one past its 10 minutes", () => {
        const now = new Date("2026-11-18T10:00:00Z");
        const state = signState(who, now);
        const later = new Date(now.getTime() + STATE_TTL_MS + 1);
        expect(verifyState(state, "INSTAGRAM", later)).toBe("expired");
    });

    it("refuses one changed or made up", () => {
        const state = signState(who);
        const [body, sig] = state.split(".");
        const other = Buffer.from(
            JSON.stringify({
                ...JSON.parse(Buffer.from(body, "base64url").toString()),
                o: "org_2",
            }),
        ).toString("base64url");
        expect(verifyState(`${other}.${sig}`, "INSTAGRAM")).toBe("invalid");
        expect(verifyState("nonsense", "INSTAGRAM")).toBe("invalid");
        expect(verifyState(undefined, "INSTAGRAM")).toBe("invalid");
    });

    it("refuses one signed under a key since replaced", () => {
        const state = signState(who);
        mutableEnv.SOCIAL_ENC_KEY = randomBytes(32).toString("base64");
        expect(verifyState(state, "INSTAGRAM")).toBe("invalid");
    });
});

describe("a sealed token", () => {
    it("opens on its own row, and nowhere else", () => {
        const b = { organizationId: "org_1", rowId: "ch_1" };
        const sealed = seal("secret-token", b);
        expect(sealed.ciphertext).not.toContain("secret-token");
        expect(unseal(sealed, b)).toBe("secret-token");
        expect(() => unseal(sealed, { ...b, rowId: "ch_2" })).toThrow(
            SocialSealMismatchError,
        );
        expect(() => unseal(sealed, { ...b, organizationId: "org_2" })).toThrow(
            SocialSealMismatchError,
        );
    });

    it("answers 503 naming the key when it isn't set", () => {
        mutableEnv.SOCIAL_ENC_KEY = undefined;
        expect(() => seal("t", { organizationId: "o", rowId: "r" })).toThrow(
            /SOCIAL_ENC_KEY/,
        );
    });
});
