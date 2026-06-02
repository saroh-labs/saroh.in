import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from "@nestjs/common";

// Mock the shared auth instance so getSession is controllable and no DB is hit.
const getSession = jest.fn();
jest.mock("../auth/auth", () => ({ auth: { api: { getSession } } }));

// Mock the trusted-origin list and the header adapter.
jest.mock("@saroh/auth", () => ({
    getTrustedOrigins: () => ["https://accounts.saroh.in"],
}));
jest.mock("better-auth/node", () => ({
    fromNodeHeaders: (h: unknown) => h,
}));

// Imported after the mocks are registered.
import { BetterAuthGuard } from "./better-auth.guard";

function ctx(req: Record<string, unknown>): ExecutionContext {
    return {
        switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
}

const sessionUser = { id: "user_1", email: "a@b.com", emailVerified: true };

describe("BetterAuthGuard", () => {
    let guard: BetterAuthGuard;

    beforeEach(() => {
        guard = new BetterAuthGuard();
        getSession.mockReset();
    });

    it("attaches the user and allows a request with a valid session", async () => {
        getSession.mockResolvedValue({
            session: { id: "s1" },
            user: sessionUser,
        });
        const req: Record<string, unknown> = { method: "GET", headers: {} };

        await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
        expect(req.user).toEqual(sessionUser);
        expect(req.session).toEqual({ id: "s1" });
    });

    it("rejects when there is no session (401)", async () => {
        getSession.mockResolvedValue(null);
        const req = { method: "GET", headers: {} };

        await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it("rejects a mutating request from an untrusted origin before checking the session (403)", async () => {
        const req = {
            method: "POST",
            headers: { origin: "https://evil.example.com" },
        };

        await expect(guard.canActivate(ctx(req))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(getSession).not.toHaveBeenCalled();
    });

    it("allows a mutating request from a trusted origin with a valid session", async () => {
        getSession.mockResolvedValue({
            session: { id: "s1" },
            user: sessionUser,
        });
        const req = {
            method: "POST",
            headers: { origin: "https://accounts.saroh.in" },
        };

        await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });

    it("does not apply the origin check to non-mutating requests", async () => {
        getSession.mockResolvedValue({
            session: { id: "s1" },
            user: sessionUser,
        });
        const req = {
            method: "GET",
            headers: { origin: "https://evil.example.com" },
        };

        await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    });
});
