// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CUSTOMERS } from "@/content/customers";

import { ReportForm } from "./report-form";

/**
 * /customers' report form (Terms rev 46): the address filled in from a
 * merchant site's link, the field's own message, the keyboard on it and
 * nothing sent when one is wrong, the reporter's email and mobile number
 * both asked for (DEC-138), and the same thanks whatever the address was.
 */
const copy = CUSTOMERS.form;
const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/customers");
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

const site = () => screen.getByLabelText(copy.siteLabel);
const message = () => screen.getByLabelText(copy.messageLabel);
const email = () => screen.getByLabelText(copy.emailLabel);
const phone = () => screen.getByLabelText(copy.phoneLabel);
const send = () =>
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));

const WORDS = "Paid for a cake that never came.";
/** Fills every field but the ones named. */
const fill = (skip: ("email" | "phone")[] = []) => {
    fireEvent.change(site(), { target: { value: " rye.saroh.app " } });
    fireEvent.change(message(), { target: { value: WORDS } });
    if (!skip.includes("email")) {
        fireEvent.change(email(), {
            target: { value: " first.last@example.com " },
        });
    }
    if (!skip.includes("phone")) {
        fireEvent.change(phone(), { target: { value: " +91 98450 12345 " } });
    }
};

describe("ReportForm", () => {
    it("fills the address in from ?site=", async () => {
        window.history.replaceState({}, "", "/customers?site=rye.saroh.app");
        render(<ReportForm />);
        await waitFor(() =>
            expect(site()).toHaveProperty("value", "rye.saroh.app"),
        );
    });

    it("says which field is wrong, first to last, and sends nothing", () => {
        render(<ReportForm />);
        const said = () => screen.getByRole("alert").textContent;
        send();
        expect(said()).toBe(copy.badSite);
        expect(document.activeElement).toBe(site());
        expect(site().getAttribute("aria-invalid")).toBe("true");

        fireEvent.change(site(), { target: { value: "rye.saroh.app" } });
        send();
        expect(said()).toBe(copy.shortMessage);
        expect(document.activeElement).toBe(message());

        fireEvent.change(message(), { target: { value: WORDS } });
        send();
        expect(said()).toBe(copy.badEmail);
        expect(document.activeElement).toBe(email());
        expect(email().getAttribute("aria-invalid")).toBe("true");
        expect(phone().getAttribute("aria-invalid")).toBeNull();

        fireEvent.change(email(), {
            target: { value: "first.last@example.com" },
        });
        send();
        expect(said()).toBe(copy.badPhone);
        expect(document.activeElement).toBe(phone());
        expect(phone().getAttribute("aria-invalid")).toBe("true");
        expect(phone().getAttribute("aria-describedby")).toBe(
            "report-error report-phone-hint",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks for the email and the mobile number, neither optional", () => {
        render(<ReportForm />);
        expect(copy.emailLabel).toBe("Your email");
        expect(copy.phoneLabel).toBe("Your mobile number");
        for (const field of [email(), phone()]) {
            expect(field.getAttribute("aria-required")).toBe("true");
        }
        expect(email().getAttribute("type")).toBe("email");
        expect(phone().getAttribute("type")).toBe("tel");
        expect(phone().getAttribute("autocomplete")).toBe("tel-national");
        expect(phone().getAttribute("inputmode")).toBe("tel");
        expect(screen.getByText(copy.emailHint)).toBeTruthy();
        expect(screen.getByText(copy.phoneHint)).toBeTruthy();
    });

    it.each([
        ["no email", () => fill(["email"]), copy.badEmail],
        [
            "an email that isn't one",
            () => {
                fill();
                fireEvent.change(email(), { target: { value: "first.last" } });
            },
            copy.badEmail,
        ],
        ["no mobile number", () => fill(["phone"]), copy.badPhone],
        [
            "a number that isn't one",
            () => {
                fill();
                fireEvent.change(phone(), { target: { value: "call me" } });
            },
            copy.badPhone,
        ],
    ])("sends nothing with %s", (_what, typed, says) => {
        render(<ReportForm />);
        typed();
        send();
        expect(screen.getByRole("alert").textContent).toBe(says);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clears the message once the field is typed in again", () => {
        render(<ReportForm />);
        fill(["phone"]);
        send();
        expect(screen.getByRole("alert").textContent).toBe(copy.badPhone);
        fireEvent.change(phone(), { target: { value: "98450 12345" } });
        expect(screen.queryByRole("alert")).toBeNull();
        expect(phone().getAttribute("aria-invalid")).toBeNull();
    });

    it("sends the report and thanks them", async () => {
        fetchMock.mockResolvedValue({
            json: () => Promise.resolve({ sent: true }),
        });
        render(<ReportForm />);
        fill();
        send();
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(copy.done),
        );
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/business-reports");
        expect(JSON.parse(init.body as string)).toEqual({
            site: "rye.saroh.app",
            message: WORDS,
            email: "first.last@example.com",
            // Sent as E.164 with its country code (#1036).
            phone: "+919845012345",
        });
    });

    it("goes to the field the server refuses", async () => {
        fetchMock.mockResolvedValue({
            json: () => Promise.resolve({ sent: false, failure: "phone" }),
        });
        render(<ReportForm />);
        fill();
        send();
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toBe(copy.badPhone),
        );
        expect(document.activeElement).toBe(phone());
        // An email box drops the spaces round what is typed by itself.
        expect(email()).toHaveProperty("value", "first.last@example.com");
    });

    it("keeps what they typed and says to try again when the send fails", async () => {
        fetchMock.mockRejectedValue(new Error("offline"));
        render(<ReportForm />);
        fill();
        send();
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toBe(copy.failed),
        );
        expect(site()).toHaveProperty("value", " rye.saroh.app ");
        expect(message()).toHaveProperty("value", WORDS);
        // An email box drops the spaces round what is typed by itself.
        expect(email()).toHaveProperty("value", "first.last@example.com");
        expect(phone()).toHaveProperty("value", " +91 98450 12345 ");
    });
});
