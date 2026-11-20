// @vitest-environment jsdom
/**
 * A password sign-in locked by too many wrong tries on the address (A-03)
 * offers the emailed code, which still signs the person in (07 F5).
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    draw,
    host,
    must,
    press,
    setUp,
    tearDown,
    text,
    type,
} from "../billing-profiles/test-kit";

import {
    CODE_INSTEAD_LABEL,
    LoginForm,
    PASSWORD_LOCKED_WORDS,
} from "./login-form";

const auth = vi.hoisted(() => ({ email: vi.fn() }));
vi.mock("@/lib/auth.client", () => ({
    authClient: { signIn: { email: auth.email } },
}));
vi.mock("@/components/auth/phone-sign-in", () => ({ PhoneSignIn: () => null }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const client = {
    send: vi.fn(() =>
        Promise.resolve({ data: { success: true }, error: null }),
    ),
    check: vi.fn(),
};

beforeEach(setUp);
afterEach(() => {
    tearDown();
    vi.clearAllMocks();
});

describe("password sign-in locked for too many tries", () => {
    it("says so, and gets a code by email in one press", async () => {
        auth.email.mockResolvedValue({
            data: null,
            error: { status: 429, code: "TOO_MANY_REQUESTS" },
        });
        draw(<LoginForm way="password" client={client} />);
        type(
            must(host.querySelector<HTMLInputElement>("#email")),
            "asha@example.com",
        );
        type(
            must(host.querySelector<HTMLInputElement>("#password")),
            "wrong-one",
        );
        await act(async () => {
            must(host.querySelector("form")).requestSubmit();
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(text(host)).toContain(PASSWORD_LOCKED_WORDS);

        await press(button(CODE_INSTEAD_LABEL, host));
        expect(client.send).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "asha@example.com",
                kind: "sign-in",
            }),
        );
    });

    it("keeps the usual words for a wrong password", async () => {
        auth.email.mockResolvedValue({
            data: null,
            error: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
        });
        draw(<LoginForm way="password" client={client} />);
        type(
            must(host.querySelector<HTMLInputElement>("#email")),
            "asha@example.com",
        );
        type(
            must(host.querySelector<HTMLInputElement>("#password")),
            "wrong-one",
        );
        await act(async () => {
            must(host.querySelector("form")).requestSubmit();
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(text(host)).not.toContain(PASSWORD_LOCKED_WORDS);
        expect(() => button(CODE_INSTEAD_LABEL, host)).toThrow();
    });
});
