/**
 * One sign-in instance per edition address (DEC-204), each with its own
 * edition's sender and GitHub app (KTD5, KTD6). Better Auth itself can't
 * load under this CommonJS runner, so `createAuth` is a stand-in that keeps
 * the options each instance was made with; `packages/auth`'s
 * `two-addresses.test.ts` runs the real library on those options.
 */
import type { CreateAuthOptions } from "@saroh/auth";

const made: CreateAuthOptions[] = [];
const sendOtp = jest.fn().mockResolvedValue(undefined);
const sendReset = jest.fn().mockResolvedValue(undefined);
const warn = jest.fn();

function load(env: Record<string, string | undefined>) {
    made.length = 0;
    let loaded!: typeof import("./auth");
    jest.isolateModules(() => {
        jest.doMock("@saroh/auth", () => ({
            VERIFICATION_OTP_EXPIRY_SECONDS: 600,
            createAuth: (opts: CreateAuthOptions) => {
                made.push(opts);
                return { options: opts, api: {}, handler: jest.fn() };
            },
        }));
        jest.doMock("@saroh/database", () => ({ prisma: {} }));
        jest.doMock("@nestjs/common", () => ({
            ...jest.requireActual("@nestjs/common"),
            Logger: jest.fn(() => ({ warn, log: jest.fn(), error: jest.fn() })),
        }));
        jest.doMock("../../env", () => ({ env }));
        jest.doMock("../email", () => ({
            sendVerificationOtpEmail: sendOtp,
            sendPasswordResetEmail: sendReset,
            sendExistingAccountEmail: jest.fn(),
            sendChangeEmailConfirmationEmail: jest.fn(),
            sendDeleteAccountEmail: jest.fn(),
        }));
        jest.doMock("./sign-in-holds", () => ({
            signInHeldForEmail: jest.fn().mockResolvedValue(false),
            mayStartSession: jest.fn(),
        }));
        jest.doMock("../../modules/account-phone/phone-freshness", () => ({
            renewPhoneOnEmailSignIn: jest.fn(),
        }));
        jest.doMock("../../modules/analytics/product-milestones", () => ({
            signedUp: jest.fn(),
        }));
        jest.doMock("../../modules/billing/billing-profile-owner", () => ({
            noticeProfilesOfDeletedOwnerInTx: jest.fn(),
        }));
        jest.doMock("./code-mail-limits", () => ({ claimCodeMail: jest.fn() }));
        jest.doMock("./report-auth-error", () => ({
            reportAuthServerError: jest.fn(),
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require("./auth") as typeof import("./auth");
    });
    return loaded;
}

const PRODUCTION = {
    BETTER_AUTH_URL: "https://api.saroh.in",
    AUTH_GITHUB_ID: "india-id",
    AUTH_GITHUB_SECRET: "india-secret",
};

const optionsOf = (instance: unknown) =>
    (instance as { options: CreateAuthOptions }).options;

describe("authFor: one instance per edition address", () => {
    beforeEach(() => {
        sendOtp.mockClear();
        sendReset.mockClear();
        warn.mockClear();
    });

    it("runs api.saroh.tech on its own address with Global's GitHub app", () => {
        const { authFor, auth } = load({
            ...PRODUCTION,
            AUTH_GITHUB_GLOBAL_ID: "global-id",
            AUTH_GITHUB_GLOBAL_SECRET: "global-secret",
        });
        const global = optionsOf(authFor("api.saroh.tech"));
        expect(global.baseURL).toBe("https://api.saroh.tech");
        expect(global.github).toEqual({
            clientId: "global-id",
            clientSecret: "global-secret",
        });
        // India reads its own pair from the environment, as before.
        expect(optionsOf(auth).github).toBeUndefined();
        expect(authFor("api.saroh.in")).toBe(auth);
        expect(warn).not.toHaveBeenCalled();
    });

    it("leaves GitHub off Global with no pair, and India keeps its own", () => {
        const { authFor, auth } = load(PRODUCTION);
        expect(optionsOf(authFor("api.saroh.tech")).github).toBeNull();
        expect(optionsOf(auth).github).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
    });

    it("turns GitHub off on Global with half a pair, and says at boot which is missing", () => {
        const { authFor } = load({
            ...PRODUCTION,
            AUTH_GITHUB_GLOBAL_ID: "global-id",
        });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain("AUTH_GITHUB_GLOBAL_SECRET");
        expect(optionsOf(authFor("api.saroh.tech")).github).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("mails a code asked for on api.saroh.tech from Global's sender, and on api.saroh.in from India's", async () => {
        const { authFor, auth } = load(PRODUCTION);
        const code = { to: "a@example.com", otp: "123456", type: "sign-in" };
        await optionsOf(authFor("api.saroh.tech")).sendVerificationOTP?.(
            code as Parameters<
                NonNullable<CreateAuthOptions["sendVerificationOTP"]>
            >[0],
        );
        await optionsOf(auth).sendVerificationOTP?.(
            code as Parameters<
                NonNullable<CreateAuthOptions["sendVerificationOTP"]>
            >[0],
        );
        expect(sendOtp.mock.calls.map((c) => c[4])).toEqual([
            "GLOBAL",
            "INDIA",
        ]);
        await optionsOf(authFor("api.saroh.tech")).sendResetPassword?.({
            to: "a@example.com",
            url: "https://api.saroh.tech/reset",
            token: "t",
        });
        expect(sendReset).toHaveBeenCalledWith(
            "a@example.com",
            "https://api.saroh.tech/reset",
            "GLOBAL",
        );
    });

    it("finds an edition's instance for a code staff send", () => {
        const { authOfEdition, authFor, auth } = load(PRODUCTION);
        expect(authOfEdition("GLOBAL")).toBe(authFor("api.saroh.tech"));
        expect(authOfEdition("INDIA")).toBe(auth);
        expect(authOfEdition(null)).toBe(auth);
    });

    it("keeps one instance on a local stack, as India", () => {
        const { authFor, authOfEdition, auth } = load({
            BETTER_AUTH_URL: "https://api.saroh.localhost",
        });
        expect(authFor("api.saroh.tech")).toBe(auth);
        expect(authOfEdition("GLOBAL")).toBe(auth);
        expect(made).toHaveLength(1);
    });
});
