/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteTrackersRow } from "@/lib/businesses";

import { SiteTrackers } from "./site-trackers";

const actions = vi.hoisted(() => ({ siteTrackersAction: vi.fn() }));
vi.mock("@/lib/business-actions", () => actions);

const on: SiteTrackersRow = {
    id: "site_1",
    name: "Northwind",
    subdomain: "northwind",
    trackersOn: 2,
    switchedOff: null,
    switchedOffBy: null,
};
const off: SiteTrackersRow = {
    ...on,
    switchedOff: {
        at: "2026-10-08T10:00:00.000Z",
        reason: "Pixel account reported for misuse",
        byUserId: "staff_1",
    },
    switchedOffBy: "Asha",
};

beforeEach(() => {
    actions.siteTrackersAction.mockReset();
    actions.siteTrackersAction.mockResolvedValue({ ok: true, data: null });
});
afterEach(cleanup);

describe("SiteTrackers", () => {
    it("shows a switched-off site with who and why", () => {
        render(<SiteTrackers organizationId="org_1" sites={[off]} canSwitch />);
        expect(screen.getByText("Switched off")).toBeTruthy();
        expect(
            screen.getByText(/by Asha · Pixel account reported for misuse/),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Switch back on" }),
        ).toBeTruthy();
    });

    it("hides the switch from staff without the permission", () => {
        render(
            <SiteTrackers
                organizationId="org_1"
                sites={[on]}
                canSwitch={false}
            />,
        );
        expect(
            screen.getByText("2 trackers on", { exact: false }),
        ).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("switches off only after a reason is given, then sends it", async () => {
        render(<SiteTrackers organizationId="org_1" sites={[on]} canSwitch />);
        fireEvent.click(screen.getByRole("button", { name: "Switch off" }));

        const submit = await screen.findByRole("button", {
            name: "Switch off trackers",
        });
        expect((submit as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByLabelText(/Reason/), {
            target: { value: "Pixel account reported for misuse" },
        });
        expect((submit as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(submit);

        await waitFor(() =>
            expect(actions.siteTrackersAction).toHaveBeenCalledWith(
                "org_1",
                "site_1",
                expect.objectContaining({
                    reason: "Pixel account reported for misuse",
                    switchOn: false,
                }),
            ),
        );
        const sent = actions.siteTrackersAction.mock.calls[0]?.[2] as {
            idempotencyKey: string;
        };
        expect(sent.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    });

    it("shows the API's refusal in the dialog", async () => {
        actions.siteTrackersAction.mockResolvedValue({
            ok: false,
            error: "Could not switch the trackers back on.",
        });
        render(<SiteTrackers organizationId="org_1" sites={[off]} canSwitch />);
        fireEvent.click(screen.getByRole("button", { name: "Switch back on" }));
        fireEvent.change(await screen.findByLabelText(/Reason/), {
            target: { value: "Owner fixed the account" },
        });
        const confirm = screen
            .getAllByRole("button", { name: "Switch back on" })
            .at(-1);
        if (!confirm) throw new Error("no confirm button");
        fireEvent.click(confirm);

        expect((await screen.findByRole("alert")).textContent).toContain(
            "Could not switch the trackers back on.",
        );
        expect(actions.siteTrackersAction).toHaveBeenCalledWith(
            "org_1",
            "site_1",
            expect.objectContaining({ switchOn: true }),
        );
    });
});
