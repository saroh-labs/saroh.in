// @vitest-environment jsdom
/**
 * Customers › Requests (DEC-172, #1107; U14): rows read first, each
 * opening its side sheet where the request is finished: the existing
 * removal, or closed with a reason the dialog insists on. The tab has an
 * empty state and a failed one, never an empty list on a failed read; the
 * customer's page has one banner, with Review removal and Close without
 * removal.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { DataRequestRow } from "@/lib/customer-workspace/data-requests-view";

import { RequestBanner } from "./request-banner";
import { RequestsView } from "./requests-view";

const closeDataRequestAction = vi.fn();
vi.mock("@/lib/customer-workspace/data-request-actions", () => ({
    closeDataRequestAction: (...a: unknown[]) =>
        closeDataRequestAction(...a) as unknown,
}));
const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace, refresh }),
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);
vi.mock("@saroh/ui/dialog", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).dialogMock(),
);
// The existing removal is its own component, with its own tests: here it
// is only whether it opens, for whom, and what happens once it ran.
vi.mock("@/components/customers/detail/remove-details-dialog", () => ({
    RemoveDetailsDialog: ({
        name,
        onRemoved,
    }: {
        name: string;
        onRemoved: () => void;
    }) => (
        <div role="alertdialog" data-name={name}>
            <button type="button" onClick={onRemoved}>
                Remove details
            </button>
        </div>
    ),
}));

const OPEN: DataRequestRow = {
    id: "cdr_1",
    kind: "REMOVAL",
    status: "OPEN",
    askedAt: "2026-10-19T06:00:00.000Z",
    handledAt: null,
    reason: null,
    contactId: "c1",
    name: "Asha Rao",
    email: "asha@example.com",
};

const UNLINKED: DataRequestRow = {
    ...OPEN,
    id: "cdr_2",
    contactId: null,
    name: null,
    email: "meera@example.com",
};

const s = stage();
const view = (rows: DataRequestRow[] | null, filter: "open" | "all" = "open") =>
    s.render(
        <RequestsView
            heading={<h1>Customers</h1>}
            tabs={null}
            filter={filter}
            rows={rows}
            canRemove
        />,
    );
const row = (name: RegExp) =>
    Array.from(document.querySelectorAll("li button")).find((b) =>
        name.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement | undefined;

async function typeReason(value: string) {
    const area = s.dialog()?.querySelector("textarea");
    if (!area) throw new Error("No reason field");
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set?.call(area, value);
        area.dispatchEvent(new Event("input", { bubbles: true }));
        await Promise.resolve();
    });
}

/** Presses the dialog's own button and lets react-hook-form settle. */
async function pressAndSettle(name: string, el: ParentNode | null) {
    await act(async () => {
        s.button(name, el)?.click();
        for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

beforeEach(() => {
    s.mount();
    for (const m of [closeDataRequestAction, refresh, replace, showSuccess])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("the Requests tab", () => {
    it("lists each request with its date and status, read first", () => {
        view([OPEN, UNLINKED]);
        expect(
            row(/^Asha Rao, asked to remove their data, Open$/),
        ).toBeTruthy();
        // No name: the email they asked from, and how to find them.
        expect(row(/^meera@example\.com, /)).toBeTruthy();
        expect(s.text()).toContain("Not linked to a customer yet");
        expect(s.sheet()).toBe(null);
    });

    it("says when there are none, in the filter's words", () => {
        view([]);
        expect(s.text()).toContain("No open requests");
        view([], "all");
        expect(s.text()).toContain("No requests yet");
    });

    it("a failed read says so with Try again, never an empty list", () => {
        view(null);
        expect(s.text()).toContain("Couldn't load requests");
        expect(s.text()).not.toContain("No open requests");
        s.press("Try again");
        expect(refresh).toHaveBeenCalled();
    });

    it("a row opens its side sheet, with the removal, the close and the customer", () => {
        view([OPEN]);
        act(() => row(/^Asha Rao/)?.click());
        const sheet = s.sheet();
        expect(s.title(sheet)).toBe("Asha Rao's request");
        expect(sheet?.textContent).toContain("asha@example.com");
        expect(sheet?.textContent).toContain(
            "Receipts and invoices are kept as the law requires.",
        );
        expect(s.button("Remove their details…", sheet)).toBeTruthy();
        expect(s.button("Close without removal…", sheet)).toBeTruthy();
        expect(
            sheet?.querySelector('a[href="/contacts/c1"]')?.textContent,
        ).toBe("Open customer");
    });

    it("an unlinked request offers the close, not a removal there is no one for", () => {
        view([UNLINKED]);
        act(() => row(/^meera@example\.com/)?.click());
        const sheet = s.sheet();
        expect(s.button("Remove their details…", sheet)).toBeUndefined();
        expect(s.button("Close without removal…", sheet)).toBeTruthy();
        expect(sheet?.querySelector("a")).toBe(null);
    });

    it("Remove their details runs the existing removal for them, then the list reads again", () => {
        view([OPEN]);
        act(() => row(/^Asha Rao/)?.click());
        s.press("Remove their details…", s.sheet());
        const removal = document.querySelector('[role="alertdialog"]');
        expect(removal?.getAttribute("data-name")).toBe("Asha Rao");
        s.press("Remove details", removal);
        expect(showSuccess).toHaveBeenCalledWith(
            expect.stringContaining("the request is done"),
        );
        expect(refresh).toHaveBeenCalled();
        expect(s.sheet()).toBe(null);
    });

    it("a done request is read only", () => {
        view([
            {
                ...OPEN,
                status: "DONE",
                handledAt: "2026-10-20T06:00:00.000Z",
                contactId: null,
                // The API names nobody once done (review #19).
                name: null,
                email: null,
            },
        ]);
        act(() =>
            row(
                /^A removed customer, asked to remove their data, Done$/,
            )?.click(),
        );
        const sheet = s.sheet();
        expect(sheet?.textContent).toContain("Removed");
        expect(s.button("Remove their details…", sheet)).toBeUndefined();
        expect(s.button("Close without removal…", sheet)).toBeUndefined();
    });
});

describe("Close without removal", () => {
    it("needs a reason before it sends anything", async () => {
        view([OPEN]);
        act(() => row(/^Asha Rao/)?.click());
        s.press("Close without removal…", s.sheet());
        const dialog = s.dialog();
        expect(s.title(dialog)).toBe("Close without removing their details?");
        await pressAndSettle("Close request", dialog);
        expect(closeDataRequestAction).not.toHaveBeenCalled();
        expect(s.dialog()?.textContent).toContain("Say why you're closing it");
    });

    it("sends the reason, says so, and the list reads again", async () => {
        closeDataRequestAction.mockResolvedValue({
            ok: true,
            data: { ...OPEN, status: "CLOSED_WITHOUT_REMOVAL" },
        });
        view([OPEN]);
        act(() => row(/^Asha Rao/)?.click());
        s.press("Close without removal…", s.sheet());
        await typeReason("  They asked us to keep it after all  ");
        await pressAndSettle("Close request", s.dialog());
        expect(closeDataRequestAction).toHaveBeenCalledWith(
            "cdr_1",
            "They asked us to keep it after all",
            "c1",
        );
        expect(showSuccess).toHaveBeenCalledWith(
            "Request closed. We've emailed them.",
        );
        expect(refresh).toHaveBeenCalled();
    });

    it("a refusal stays in the dialog, with the reason kept", async () => {
        closeDataRequestAction.mockResolvedValue({
            ok: false,
            error: "This request was already closed.",
        });
        view([OPEN]);
        act(() => row(/^Asha Rao/)?.click());
        s.press("Close without removal…", s.sheet());
        await typeReason("Kept on request");
        await pressAndSettle("Close request", s.dialog());
        expect(s.dialog()?.textContent).toContain(
            "This request was already closed.",
        );
        expect(s.dialog()?.querySelector("textarea")?.value).toBe(
            "Kept on request",
        );
        expect(showSuccess).not.toHaveBeenCalled();
    });
});

describe("the customer page's banner", () => {
    it("says when they asked, and opens the existing removal preview", () => {
        const review = vi.fn();
        s.render(
            <RequestBanner request={OPEN} name="Asha Rao" onReview={review} />,
        );
        expect(s.text()).toContain("Asked to remove their data on");
        expect(s.text()).toContain(
            "Receipts and invoices are kept as the law requires.",
        );
        s.press("Review removal");
        expect(review).toHaveBeenCalled();
        s.press("Close without removal");
        expect(s.title(s.dialog())).toBe(
            "Close without removing their details?",
        );
    });

    it("without the permission it informs, with nothing to press", () => {
        s.render(<RequestBanner request={OPEN} name="Asha Rao" />);
        expect(s.button("Review removal")).toBeUndefined();
        expect(s.button("Close without removal")).toBeUndefined();
    });
});
