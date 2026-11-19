// better-auth's ESM build can't load under ts-jest; only the path list is needed.
jest.mock("@saroh/auth", () => ({
    CODE_MAIL_PATHS: [
        "/email-otp/send-verification-otp",
        "/request-password-reset",
        "/sign-up/email",
        "/sign-in/email",
    ],
}));

import { env } from "../../env";
import { refusedCodeMail } from "./code-mail-origin";

/** Better Auth's code-mailing routes answer only an accounts site (owner, 18 Nov). */
describe("refusedCodeMail", () => {
    const before = env.ACCOUNTS_URL;
    beforeAll(() => {
        env.ACCOUNTS_URL = "https://accounts.example.test";
    });
    afterAll(() => {
        env.ACCOUNTS_URL = before;
    });

    const post = (path: string, headers: Record<string, string> = {}) =>
        new Request(`https://api.example.test/api/auth${path}`, {
            method: "POST",
            headers,
        });

    it("passes a sign-up or a code asked from accounts", () => {
        for (const path of [
            "/sign-up/email",
            "/email-otp/send-verification-otp",
        ]) {
            expect(
                refusedCodeMail(
                    post(path, { origin: "https://accounts.example.test" }),
                ),
            ).toBeNull();
        }
        expect(
            refusedCodeMail(
                post("/request-password-reset", {
                    referer: "https://accounts.example.test/forgot-password",
                }),
            ),
        ).toBeNull();
    });

    it("refuses another origin, or none, with 403", async () => {
        for (const headers of [{ origin: "https://evil.example" }, {}]) {
            const answer = refusedCodeMail(post("/sign-up/email", headers));
            expect(answer?.status).toBe(403);
            await expect(answer?.json()).resolves.toMatchObject({
                code: "FORBIDDEN_ORIGIN",
            });
        }
    });

    it("leaves a password sign-in and every other route to Better Auth", () => {
        expect(refusedCodeMail(post("/sign-in/email"))).toBeNull();
        expect(refusedCodeMail(post("/get-session"))).toBeNull();
        expect(
            refusedCodeMail(
                new Request("https://api.example.test/api/auth/sign-up/email"),
            ),
        ).toBeNull();
    });
});
