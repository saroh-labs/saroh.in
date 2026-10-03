// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WaitlistContent } from "@/content/waitlist";
import { WAITLIST } from "@/content/waitlist";
import { WAITLIST_MESSAGES } from "@/lib/waitlist";

import { WaitlistForm } from "./waitlist-form";

/**
 * The waitlist card (plan U30): the design's messages and nothing sent when
 * a field is missing; the API's place and referral link when it joins; the
 * generic done state on a repeat (D-8); a retry message with the form kept
 * when the send fails; and GA hearing the kind, source, plan and referral —
 * never the email or the name.
 */
const fetchMock = vi.fn();
const gtag = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.gtag = gtag;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
    };
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    gtag.mockReset();
});

function answer(body: unknown, status = 200) {
    fetchMock.mockResolvedValue({
        ok: status < 400,
        status,
        json: () => Promise.resolve(body),
    });
}

function renderForm(
    props: Partial<Parameters<typeof WaitlistForm>[0]> = {},
    content: WaitlistContent = WAITLIST,
) {
    return render(<WaitlistForm content={content} src="direct" {...props} />);
}

function fill({
    business = "Glow Studio",
    kind = "Salon or beauty",
    email = "you@glowstudio.in",
    city = "Pune",
}: Partial<Record<"business" | "kind" | "email" | "city", string>> = {}) {
    fireEvent.input(screen.getByLabelText("Business name"), {
        target: { value: business },
    });
    if (kind) fireEvent.click(screen.getByRole("button", { name: kind }));
    fireEvent.input(screen.getByLabelText("Email"), {
        target: { value: email },
    });
    fireEvent.input(screen.getByLabelText("City"), {
        target: { value: city },
    });
}

async function submit() {
    await act(async () => {
        fireEvent.click(
            screen.getByRole("button", { name: "Join the waitlist" }),
        );
        await Promise.resolve();
    });
}

describe("WaitlistForm", () => {
    it("shows the design's three messages and sends nothing", async () => {
        renderForm();
        await submit();

        expect(screen.getByText(WAITLIST_MESSAGES.business)).toBeTruthy();
        expect(screen.getByText(WAITLIST_MESSAGES.kind)).toBeTruthy();
        expect(screen.getByText(WAITLIST_MESSAGES.email)).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
        // City is optional and never refused.
        expect(
            screen.getByLabelText("City").getAttribute("aria-invalid"),
        ).toBeNull();
    });

    it("clears a message as its field is changed", async () => {
        renderForm();
        await submit();
        fireEvent.click(screen.getByRole("button", { name: "Clinic" }));

        expect(screen.queryByText(WAITLIST_MESSAGES.kind)).toBeNull();
        expect(screen.getByText(WAITLIST_MESSAGES.business)).toBeTruthy();
    });

    it("joins: the API's place and a referral link, and GA without personal data", async () => {
        answer({
            status: "success",
            created: true,
            position: 7,
            ref: "abcdefgh",
        });
        renderForm({ plan: "grow", src: "pricing", referral: "hjkmnpqr" });
        fill();
        await submit();

        await screen.findByText("Glow Studio is #7 on the list.");
        expect(
            screen.getByText(`${window.location.host}/waitlist?ref=abcdefgh`),
        ).toBeTruthy();

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/waitlist");
        expect(JSON.parse(init.body as string)).toEqual({
            business: "Glow Studio",
            kind: "salon",
            email: "you@glowstudio.in",
            city: "Pune",
            plan: "grow",
            src: "pricing",
            ref: "hjkmnpqr",
        });

        expect(gtag).toHaveBeenCalledWith("event", "waitlist_join", {
            kind: "salon",
            src: "pricing",
            plan: "grow",
            ref: true,
        });
        const sent = JSON.stringify(gtag.mock.calls);
        expect(sent).not.toContain("you@glowstudio.in");
        expect(sent).not.toContain("Glow Studio");
    });

    it("answers a repeat with the generic done state: no place, no link", async () => {
        answer({ status: "success", created: false });
        renderForm();
        fill();
        await submit();

        await screen.findByText("Glow Studio is on the list.");
        expect(screen.queryByText(/#\d+/)).toBeNull();
        expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    });

    it("keeps the form and asks to try again when the send fails", async () => {
        fetchMock.mockRejectedValue(new Error("offline"));
        renderForm();
        fill();
        await submit();

        expect((await screen.findByRole("alert")).textContent).toMatch(
            /try again/i,
        );
        expect(
            screen.getByLabelText<HTMLInputElement>("Business name").value,
        ).toBe("Glow Studio");
        expect(gtag).not.toHaveBeenCalled();
    });

    it("says when one address has tried too often", async () => {
        answer({ status: "failure", reason: { code: "RATE_LIMITED" } }, 429);
        renderForm();
        fill();
        await submit();

        expect((await screen.findByRole("alert")).textContent).toMatch(
            /too many tries/i,
        );
    });

    it("puts an address the API refuses on the email field", async () => {
        answer({ status: "failure", reason: { code: "INVALID" } }, 400);
        renderForm();
        fill();
        await submit();

        await screen.findByText(WAITLIST_MESSAGES.email);
    });

    it("starts again, empty, for another business", async () => {
        answer({
            status: "success",
            created: true,
            position: 7,
            ref: "abcdefgh",
        });
        renderForm();
        fill();
        await submit();
        await screen.findByText("Glow Studio is #7 on the list.");

        fireEvent.click(
            screen.getByRole("button", { name: "Add another business" }),
        );

        await waitFor(() =>
            expect(
                screen.getByLabelText<HTMLInputElement>("Business name").value,
            ).toBe(""),
        );
    });

    it("names the opening day and the offer once they are set", async () => {
        answer({
            status: "success",
            created: true,
            position: 3,
            ref: "abcdefgh",
        });
        renderForm(
            {},
            {
                openingDate: "2030-03-05",
                offer: {
                    headline: "Offer A",
                    terms: "Terms A.",
                    doneLine: "Line A.",
                },
            },
        );
        expect(screen.getByText("Offer A")).toBeTruthy();
        expect(screen.getByText(/once on 5 Mar/)).toBeTruthy();

        fill();
        await submit();
        await screen.findByText(
            /on Tuesday 5 March with your invite\. Line A\./,
        );
    });
});
