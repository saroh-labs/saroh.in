// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHANGELOG } from "@/content/changelog";

import { ChangelogSignup } from "./changelog-signup";

/**
 * The changelog's email field (plan U4, KTD-5): it joins the waitlist's
 * list as `src=changelog`, and a second join with the same address reads
 * exactly like the first.
 */
const fetchMock = vi.fn();
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
});

const answer = (body: unknown) =>
    Promise.resolve({ json: () => Promise.resolve(body) });

function submit(email: string) {
    fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: email },
    });
    fireEvent.click(
        screen.getByRole("button", { name: CHANGELOG.signupLabel }),
    );
}

describe("ChangelogSignup", () => {
    it("posts the email with src=changelog and confirms", async () => {
        fetchMock.mockReturnValue(answer({ status: "success", created: true }));
        render(<ChangelogSignup />);
        submit("owner@shop.in");
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(
                CHANGELOG.signupDone,
            ),
        );
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/waitlist");
        expect(JSON.parse(init.body as string)).toEqual({
            email: "owner@shop.in",
            src: "changelog",
        });
    });

    it("a repeat join is not an error: the same confirmation", async () => {
        fetchMock.mockReturnValue(
            answer({ status: "success", created: false }),
        );
        render(<ChangelogSignup />);
        submit("owner@shop.in");
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(
                CHANGELOG.signupDone,
            ),
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("refuses an address that isn't one, without sending", () => {
        render(<ChangelogSignup />);
        submit("not-an-email");
        expect(screen.getByRole("alert").textContent).toBe(
            "Enter an email like name@shop.in.",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("says so when the join fails, keeping what was typed", async () => {
        fetchMock.mockReturnValue(
            answer({ status: "failure", reason: { code: "UPSTREAM" } }),
        );
        render(<ChangelogSignup />);
        submit("owner@shop.in");
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(screen.getByLabelText("Email")).toHaveProperty(
            "value",
            "owner@shop.in",
        );
    });
});
