// @vitest-environment jsdom
/**
 * Profile and sign-in › Devices: Better Auth lists devices only for a
 * recent sign-in, and answers SESSION_NOT_FRESH otherwise. The row says to
 * sign in again, with a way to, rather than "Couldn't load". Made-up details.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    draw,
    host,
    press,
    setUp,
    tearDown,
    text,
} from "../billing-profiles/test-kit";

import { ProfileRows } from "./profile-rows";

const auth = vi.hoisted(() => ({
    useSession: () => ({ data: { session: { token: "t_here" } } }),
    listSessions: vi.fn(),
    listAccounts: vi.fn(),
    signOut: vi.fn(),
}));
vi.mock("@/lib/auth.client", () => ({ authClient: auth }));
vi.mock("@/lib/phone-sign-in", () => ({
    phoneOptions: () => Promise.resolve({ available: false }),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@saroh/site-blocks/challenge", () => ({
    ChallengeWidget: () => null,
}));

beforeEach(() => {
    setUp();
    auth.listAccounts.mockResolvedValue({ data: [], error: null });
    auth.signOut.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

async function drawRows() {
    draw(
        <ProfileRows
            name="Asha Verma"
            email="asha.verma@example.com"
            phoneE164={null}
            phoneVerifiedAt={null}
            soleOwned={[]}
        />,
    );
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("the Devices row", () => {
    it("asks for a fresh sign-in, and signs out back to this page", async () => {
        auth.listSessions.mockResolvedValue({
            data: null,
            error: { code: "SESSION_NOT_FRESH", status: 403 },
        });
        await drawRows();
        expect(text(host)).toContain(
            "Sign in again to see where you're signed in.",
        );
        expect(text(host)).not.toContain("Couldn't load");

        await press(button("Sign in again", host));
        expect(auth.signOut).toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith("/login?redirect=%2Faccount");
    });

    it("says Couldn't load for any other failure", async () => {
        auth.listSessions.mockResolvedValue({
            data: null,
            error: { status: 500 },
        });
        await drawRows();
        expect(text(host)).toContain("Couldn't load");
        expect(button("Manage", host)).toBeTruthy();
    });
});
