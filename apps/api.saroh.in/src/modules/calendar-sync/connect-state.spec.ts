import { randomBytes } from "node:crypto";

import { env } from "../../env";
import { signState, STATE_TTL_MS, verifyState } from "./connect-state";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;
// A throwaway key for this run only, never a value in the repo.
const key = () => randomBytes(32).toString("base64");
beforeEach(() => {
    mutableEnv.CALENDAR_ENC_KEY = key();
});
afterAll(() => {
    mutableEnv.CALENDAR_ENC_KEY = before;
});

const who = {
    organizationId: "org_a",
    membershipId: "mem_1",
    userId: "user_1",
};
const now = new Date("2027-01-04T05:00:00Z");

describe("the consent state", () => {
    it("names the business and the person, and is good for 10 minutes", () => {
        const state = signState(who, now);
        expect(verifyState(state, now)).toMatchObject({
            ...who,
            expiresAt: now.getTime() + STATE_TTL_MS,
        });
        expect(verifyState(state, new Date(now.getTime() + STATE_TTL_MS))).toBe(
            "expired",
        );
    });

    it("refuses a tampered state", () => {
        const [body, sig] = signState(who, now).split(".");
        const forged = Buffer.from(
            JSON.stringify({
                o: "org_b",
                m: "mem_1",
                u: "user_1",
                n: "x",
                e: now.getTime() + 60_000,
            }),
        ).toString("base64url");
        expect(verifyState(`${forged}.${sig}`, now)).toBe("invalid");
        expect(verifyState(`${body}.${sig}x`, now)).toBe("invalid");
        expect(verifyState(`${body}`, now)).toBe("invalid");
        expect(verifyState(undefined, now)).toBe("invalid");
    });

    it("refuses one signed under a key that isn't on the ring", () => {
        const state = signState(who, now);
        mutableEnv.CALENDAR_ENC_KEY = key();
        expect(verifyState(state, now)).toBe("invalid");
    });

    it("still opens one signed under the older key on the ring", () => {
        const old = mutableEnv.CALENDAR_ENC_KEY ?? "";
        const state = signState(who, now);
        mutableEnv.CALENDAR_ENC_KEY = `v2:${key()},v1:${old}`;
        expect(verifyState(state, now)).toMatchObject(who);
    });
});
