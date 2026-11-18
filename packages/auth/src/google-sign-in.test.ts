import { decryptOAuthToken, setTokenUtil } from "better-auth/oauth2";
import { describe, expect, it } from "vitest";

import { authOptions } from "./server";

/**
 * Google sign-in stays apart from Google Calendar (GC-08, GC-17): the same
 * Google client is given calendar access when someone connects their
 * calendar, so sign-in must not ask Google to fold those scopes into its
 * own token, its tokens are kept encrypted, and no provider links an
 * account without saying it verified the address.
 */
describe("Google sign-in options", () => {
    const options = authOptions();

    it("asks Google for sign-in's own scopes only, never those granted before", () => {
        const google = options.socialProviders?.google as
            { includeGrantedScopes?: boolean } | undefined;
        expect(google?.includeGrantedScopes).toBe(false);
    });

    it("keeps sign-in tokens encrypted", () => {
        expect(options.account?.encryptOAuthTokens).toBe(true);
    });

    it("trusts no provider to link an address it didn't verify", () => {
        expect(options.account?.accountLinking?.trustedProviders ?? []).toEqual(
            [],
        );
        expect(options.account?.accountLinking?.enabled).toBe(true);
    });

    it("still reads a token stored in the clear before encryption was on", async () => {
        const ctx = {
            options,
            secretConfig: "a-throwaway-secret-for-this-test-only-0123456789",
        } as unknown as Parameters<typeof decryptOAuthToken>[1];
        // GitHub's and Google's own token shapes pass through untouched.
        for (const plain of ["gho_not-a-real-token", "ya29.not-a-real-token"]) {
            expect(await decryptOAuthToken(plain, ctx)).toBe(plain);
        }
        // A new one is written encrypted and reads back.
        const sealed = String(await setTokenUtil("ya29.fresh", ctx));
        expect(sealed).not.toBe("ya29.fresh");
        expect(await decryptOAuthToken(sealed, ctx)).toBe("ya29.fresh");
    });
});
