import type { RenderedEnquiry } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SendResult } from "../account/messages";
import { PageSections } from "../section-renderer";
import type { EnquiryThread } from "./enquiry";
import EnquirySection, {
    ENQUIRY_FALLBACK_ERROR,
    enquiryErrorMessage,
    THREAD_MESSAGE_MAX,
} from "./enquiry";

/**
 * The Contact page's form for a signed-in customer (round-2 A13): it asks
 * only for the message and writes it to their thread with the business —
 * never the public enquiry — and the thanks links to their Messages.
 */

const content = BLOCK_META.enquiry.fixtures.default as RenderedEnquiry;

const SENT: SendResult = {
    ok: true,
    message: {
        ref: "m_1",
        from: "me",
        text: "Can I move my Saturday class?",
        sentAt: "2026-09-29T10:00:00.000Z",
    },
};

function thread(send = vi.fn().mockResolvedValue(SENT)): EnquiryThread {
    return {
        businessName: "Pulse Fitness",
        customer: { email: "farah@example.in", name: "Farah Khan" },
        send,
        messagesHref: "/account/messages",
    };
}

function type(text: string) {
    act(() => {
        fireEvent.change(screen.getByLabelText("Message"), {
            target: { value: text },
        });
    });
}

async function send() {
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await Promise.resolve();
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
});

describe("the Contact page's form, signed in (A13)", () => {
    it("asks only for the message, says who is writing, and sends it to the thread", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        const t = thread();
        render(<EnquirySection content={content} thread={t} />);

        // Who they are is known: no name or email to type.
        expect(screen.queryByLabelText(/Your name/)).toBeNull();
        expect(screen.queryByLabelText(/Email/)).toBeNull();
        expect(
            screen.getByText(
                "Signed in as Farah Khan. The reply comes to your Messages.",
            ),
        ).toBeTruthy();

        type("  Can I move my Saturday class?  ");
        await send();

        expect(t.send).toHaveBeenCalledWith("Can I move my Saturday class?");
        // Never the public enquiry.
        expect(fetch).not.toHaveBeenCalled();
        expect(screen.getByRole("status").textContent).toContain(
            "Sent. Pulse Fitness will reply in your Messages.",
        );
        expect(
            screen
                .getByRole("link", { name: "Open Messages" })
                .getAttribute("href"),
        ).toBe("/account/messages");
    });

    it("names the customer by email while they have no name", () => {
        render(
            <EnquirySection
                content={content}
                thread={{
                    ...thread(),
                    customer: { email: "farah@example.in", name: null },
                }}
            />,
        );
        expect(
            screen.getByText(/^Signed in as farah@example\.in\./),
        ).toBeTruthy();
    });

    it("refuses an empty message, and one past the cap, without sending", async () => {
        const t = thread();
        render(<EnquirySection content={content} thread={t} />);
        await send();
        expect(screen.getByRole("alert").textContent).toBe(
            "Write your message",
        );
        type("x".repeat(THREAD_MESSAGE_MAX + 1));
        await send();
        expect(screen.getByRole("alert").textContent).toBe(
            "Keep it to 2,000 characters",
        );
        expect(t.send).not.toHaveBeenCalled();
    });

    it("shows the site server's sentence when sending is refused, and keeps the message", async () => {
        const t = thread(
            vi.fn().mockResolvedValue({
                ok: false,
                message:
                    "You're sending messages quickly. Wait a minute, then try again.",
            }),
        );
        render(<EnquirySection content={content} thread={t} />);
        type("Hello");
        await send();
        expect(screen.getByRole("alert").textContent).toBe(
            "You're sending messages quickly. Wait a minute, then try again.",
        );
        expect(screen.getByLabelText("Message")).toHaveProperty(
            "value",
            "Hello",
        );
    });

    it("says the business couldn't be reached when the action throws", async () => {
        const t = thread(vi.fn().mockRejectedValue(new Error("offline")));
        render(<EnquirySection content={content} thread={t} />);
        type("Hello");
        await send();
        expect(screen.getByRole("alert").textContent).toBe(
            "We couldn't reach the business. Try again in a moment.",
        );
    });

    it("starts the message with what a link asked about", async () => {
        window.history.replaceState(null, "", "/contact?pack=10-class%20pack");
        render(<EnquirySection content={content} thread={thread()} />);
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(screen.getByLabelText("Message")).toHaveProperty(
            "value",
            "I'd like to buy 10-class pack. ",
        );
    });

    it("is the public enquiry when nobody is signed in", () => {
        render(<EnquirySection content={content} thread={null} />);
        expect(screen.getByLabelText(/Your name/)).toBeTruthy();
        expect(screen.queryByText(/Signed in as/)).toBeNull();
    });

    it("reaches the form through the page's sections", () => {
        render(
            <PageSections
                sections={[{ type: "enquiry", content }]}
                thread={thread()}
            />,
        );
        expect(screen.getByText(/^Signed in as Farah Khan\./)).toBeTruthy();
    });
});

describe("enquiryErrorMessage (UX-066)", () => {
    const fields = [
        {
            name: "email",
            label: "Email",
            type: "email" as const,
            required: true,
        },
        {
            name: "name",
            label: "Your name",
            type: "text" as const,
            required: true,
        },
    ];

    it("says a bad email in words", () => {
        expect(
            enquiryErrorMessage(
                {
                    error: {
                        message: 'Field "email" must be a valid email',
                        details: { field: "email", reason: "invalid_email" },
                    },
                },
                fields,
            ),
        ).toBe(
            "That email doesn't look right — check for a missing @ or a typo.",
        );
    });

    it("names the box that needs filling in by its label", () => {
        expect(
            enquiryErrorMessage(
                { error: { details: { field: "name", reason: "required" } } },
                fields,
            ),
        ).toBe("Please fill in your name.");
    });

    it("never shows the API's own words", () => {
        expect(
            enquiryErrorMessage(
                {
                    error: {
                        message: "This form is misconfigured (no email field)",
                    },
                },
                fields,
            ),
        ).toBe(ENQUIRY_FALLBACK_ERROR);
        expect(enquiryErrorMessage(null, fields)).toBe(ENQUIRY_FALLBACK_ERROR);
    });
});
