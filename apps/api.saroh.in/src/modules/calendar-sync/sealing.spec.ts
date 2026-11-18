import { randomBytes } from "node:crypto";

import { ServiceUnavailableException } from "@nestjs/common";

import { env } from "../../env";
import { CalendarSealMismatchError, openToken, sealToken } from "./sealing";

const mutableEnv = env as { CALENDAR_ENC_KEY?: string };
const before = mutableEnv.CALENDAR_ENC_KEY;
// Throwaway keys for this run only, never a value in the repo.
const key = () => randomBytes(32).toString("base64");
beforeEach(() => {
    mutableEnv.CALENDAR_ENC_KEY = key();
});
afterAll(() => {
    mutableEnv.CALENDAR_ENC_KEY = before;
});

const here = { organizationId: "org_a", connectionId: "conn_1" };

describe("Google token sealing", () => {
    it("round-trips a refresh token, never in the clear", () => {
        const sealed = sealToken("1//refresh-token", here);
        expect(sealed.ciphertext).not.toContain("refresh-token");
        expect(openToken(sealed, here)).toBe("1//refresh-token");
    });

    it("refuses a token sealed for another connection or business", () => {
        const sealed = sealToken("1//refresh-token", here);
        expect(() =>
            openToken(sealed, { ...here, connectionId: "conn_2" }),
        ).toThrow(CalendarSealMismatchError);
        expect(() =>
            openToken(sealed, { ...here, organizationId: "org_b" }),
        ).toThrow(CalendarSealMismatchError);
    });

    it("opens a token sealed under the old key after a new one joins the ring", () => {
        const old = mutableEnv.CALENDAR_ENC_KEY ?? "";
        const sealed = sealToken("1//refresh-token", here);
        mutableEnv.CALENDAR_ENC_KEY = `v2:${key()},v1:${old}`;
        expect(openToken(sealed, here)).toBe("1//refresh-token");
        // And seals new tokens with the newest.
        expect(sealToken("x", here).ciphertext.startsWith("v2:")).toBe(true);
    });

    it("answers 503 naming the variable when the key is missing", () => {
        mutableEnv.CALENDAR_ENC_KEY = undefined;
        expect(() => sealToken("x", here)).toThrow(ServiceUnavailableException);
        expect(() => sealToken("x", here)).toThrow(/CALENDAR_ENC_KEY/);
    });
});
