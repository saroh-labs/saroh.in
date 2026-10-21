// @vitest-environment jsdom
/**
 * "Emails to your customers" (DEC-174, U4 #1135), the row on Settings ›
 * Providers: read first (how many are on, which are not sent, one quiet
 * line at most), Edit opens the sheet of switches, View for someone who
 * can only read them. No row while the business is offered none.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type {
    CustomerEmail,
    CustomerEmails,
} from "@/lib/communications/customer-emails";

import { CustomerEmailsBlock } from "./customer-emails-row";

vi.mock("@/lib/communications/customer-emails-actions", () => ({
    setCustomerEmail: vi.fn(),
}));
vi.mock("@/components/organizations/use-settings-undo", () => ({
    useSettingsUndo: () => ({ offer: vi.fn(), settle: vi.fn() }),
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));
vi.mock("@saroh/ui/sheet", async () =>
    (
        await import("@/components/commerce/product-settings/test-kit")
    ).sheetMock(),
);

const email = (kind: string, label: string, on = true): CustomerEmail => ({
    kind,
    label,
    says: `What ${label} sends.`,
    on,
    default: on,
    offered: true,
    reason: null,
    why: null,
});

const state = (over: Partial<CustomerEmails> = {}): CustomerEmails => ({
    notices: [
        email("MEMBERSHIP", "Membership emails"),
        email("REFUND", "Refunds"),
        email("OVERDUE_REMINDERS", "Overdue reminders", false),
    ],
    canChange: true,
    emailConnected: true,
    ...over,
});

const s = stage();
const render = (st = state()) => s.render(<CustomerEmailsBlock state={st} />);
const EDIT = "Edit emails to your customers";
const VIEW = "View emails to your customers";

beforeEach(() => s.mount());
afterEach(() => s.unmount());

describe("the row", () => {
    it("reads first: the count, what is not sent, and Edit, with nothing open", () => {
        render();
        expect(s.text()).toContain("Emails to your customers");
        expect(s.text()).toContain("Automatic emails");
        expect(s.text()).toContain("2 on, 1 off");
        expect(s.text()).toContain("Not sent: Overdue reminders.");
        expect(s.button(EDIT)).toBeDefined();
        expect(s.sheet()).toBe(null);
        expect(document.querySelectorAll('[role="switch"]')).toHaveLength(0);
    });

    it("with no email provider, one quiet line and no second Connect", () => {
        render(state({ emailConnected: false }));
        expect(s.text()).toContain(
            "None of these go out until your email is connected.",
        );
        // The page's own prompt carries Connect: never stacked here.
        expect(document.querySelector("a")).toBe(null);
        expect(document.querySelectorAll('[role="note"]')).toHaveLength(0);
    });

    it("someone who can't change them gets View, and why", () => {
        render(state({ canChange: false }));
        expect(s.button(EDIT)).toBeUndefined();
        expect(s.button(VIEW)).toBeDefined();
        expect(s.text()).toContain(
            "Your role can read these emails but not change them.",
        );
        s.press(VIEW);
        expect(s.title(s.sheet())).toBe("Emails to your customers");
    });

    it("is not drawn when the business is offered none", () => {
        render(state({ notices: [] }));
        expect(s.text()).toBe("");
        expect(s.button(EDIT)).toBeUndefined();
    });
});

describe("Edit", () => {
    it("opens the sheet with a switch for each", () => {
        render();
        s.press(EDIT);
        const sheet = s.sheet();
        expect(s.title(sheet)).toBe("Emails to your customers");
        expect(sheet?.querySelectorAll('[role="switch"]')).toHaveLength(3);
    });

    it("each opening starts from what is saved", () => {
        render();
        s.press(EDIT);
        s.press("Done", s.sheet());
        expect(s.sheet()).toBe(null);
        s.press(EDIT);
        expect(s.sheet()).not.toBe(null);
    });
});
