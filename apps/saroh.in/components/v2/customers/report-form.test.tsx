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
 * merchant site's link, the field's own message and nothing sent when one
 * is wrong, and the same thanks whatever the address was.
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
const send = () =>
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));

describe("ReportForm", () => {
    it("fills the address in from ?site=", async () => {
        window.history.replaceState({}, "", "/customers?site=rye.saroh.app");
        render(<ReportForm />);
        await waitFor(() =>
            expect(site()).toHaveProperty("value", "rye.saroh.app"),
        );
    });

    it("says which field is wrong and sends nothing", () => {
        render(<ReportForm />);
        send();
        expect(screen.getByRole("alert").textContent).toBe(copy.badSite);
        fireEvent.change(site(), { target: { value: "rye.saroh.app" } });
        send();
        expect(screen.getByRole("alert").textContent).toBe(copy.shortMessage);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends the report and thanks them", async () => {
        fetchMock.mockResolvedValue({
            json: () => Promise.resolve({ sent: true }),
        });
        render(<ReportForm />);
        fireEvent.change(site(), { target: { value: " rye.saroh.app " } });
        fireEvent.change(message(), {
            target: { value: "Paid for a cake that never came." },
        });
        send();
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(copy.done),
        );
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/business-reports");
        expect(JSON.parse(init.body as string)).toEqual({
            site: "rye.saroh.app",
            message: "Paid for a cake that never came.",
        });
    });

    it("keeps what they typed and says to try again when the send fails", async () => {
        fetchMock.mockRejectedValue(new Error("offline"));
        render(<ReportForm />);
        fireEvent.change(site(), { target: { value: "rye.saroh.app" } });
        fireEvent.change(message(), {
            target: { value: "Paid for a cake that never came." },
        });
        send();
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toBe(copy.failed),
        );
        expect(site()).toHaveProperty("value", "rye.saroh.app");
    });
});
