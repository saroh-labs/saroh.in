// @vitest-environment jsdom
/**
 * The list of billing profiles (F1, F8) and Add billing profile (F4): each
 * card's state, GST, billing email and businesses; Add starting from
 * another profile without its email, the duplicate-email error in the
 * design's words, and billing a free business to it at once. Made-up
 * profiles; the Server Actions are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileList } from "./profile-list";
import {
    button,
    dialog,
    draw,
    field,
    GURUGRAM,
    host,
    must,
    owned,
    press,
    PROFILES,
    PULSE,
    setUp,
    submit,
    tearDown,
    text,
    type,
    YOGA,
} from "./test-kit";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/account/billing-profiles",
}));
const actions = vi.hoisted(() => ({
    createProfileAction: vi.fn(),
    updateProfileAction: vi.fn(),
}));
vi.mock("@/lib/billing-profile-actions", () => actions);
const toast = vi.hoisted(() => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock("@saroh/ui/toast", () => toast);

beforeEach(() => {
    setUp();
    for (const fn of [
        refresh,
        ...Object.values(actions),
        ...Object.values(toast),
    ]) {
        fn.mockReset();
    }
});
afterEach(tearDown);

const BUSINESSES = [owned(GURUGRAM, "bp_pulse"), owned(YOGA, "bp_asha")];
const list = (startAdding = false) =>
    draw(
        <ProfileList
            profiles={PROFILES}
            businesses={BUSINESSES}
            startAdding={startAdding}
        />,
    );

describe("the list", () => {
    it("draws a card per profile, in the design's words", () => {
        list();
        const t = text(host);
        expect(t).toContain("Billing profiles");
        expect(t).toContain(
            "Who Saroh bills for each business you own. Open one to see it, change its details or move a business.",
        );
        expect(t).toContain("+ Add billing profile");
        expect(t).toContain(
            "GSTIN 06AAAAA0000A1Z5 · invoices to pulsefitness@example.com",
        );
        expect(t).toContain(
            "Not GST-registered · invoices to asha.verma@example.com",
        );
        expect(t).toContain("Couldn't link");
        expect(t).toContain("Pays for nothing yet");
        expect(t).toContain(
            "A change reaches Saroh's next invoice, never one already sent. A paid business moves to another profile at its next renewal.",
        );
        const cards = Array.from(
            host.querySelectorAll("a[aria-label^='Open ']"),
        );
        expect(cards.map((a) => a.getAttribute("href"))).toEqual([
            "/account/billing-profiles/bp_pulse",
            "/account/billing-profiles/bp_raja",
            "/account/billing-profiles/bp_asha",
            "/account/billing-profiles/bp_mill",
        ]);
    });

    it("a phone reads one line of what each pays for instead of chips", () => {
        list();
        expect(text(host)).toContain(
            "Pays for Pulse Fitness Rohtak, Pulse Fitness Gurugram",
        );
    });
});

describe("Add billing profile", () => {
    it("opens from + Add billing profile, and from ?add=1", async () => {
        list();
        await press(button("+ Add billing profile", host));
        expect(text(dialog())).toContain(
            "For a business billed to another GST entity, or one whose invoices you keep apart.",
        );
        tearDown();
        setUp();
        list(true);
        expect(text(dialog())).toContain("Add billing profile");
    });

    it("refuses an email another profile uses, naming it", async () => {
        list(true);
        type(field("Legal name"), "Pulse Fitness Faridabad LLP");
        type(field("GSTIN"), "06CCCCC0000C1Z5");
        type(field("Billing email"), "pulsefitness@example.com");
        await submit();
        expect(text(dialog())).toContain(
            "Pulse Fitness LLP already uses this email. Use a different one, so Razorpay can tell the two apart.",
        );
        expect(actions.createProfileAction).not.toHaveBeenCalled();
    });

    it("adds one, and can bill a free business to it now", async () => {
        list(true);
        const d = dialog();
        expect(text(d)).toContain("Start from (optional)");
        expect(text(d)).toContain(
            "Copies the address and GST to edit. The billing email is never copied.",
        );
        expect(text(d)).toContain("Bill a business to it now (optional)");
        type(field("Legal name"), "Asha Verma Studio");
        await press(
            must(d?.querySelector<HTMLElement>('[role="radio"][value="no"]')),
        );
        type(field("Billing email"), "studio@example.com");
        actions.createProfileAction.mockResolvedValue({
            ok: true,
            data: {
                profile: { ...PULSE, legalName: "Asha Verma Studio" },
                moved: null,
                notMoved: null,
            },
        });
        await submit();
        expect(actions.createProfileAction).toHaveBeenCalledWith(
            expect.objectContaining({
                legalName: "Asha Verma Studio",
                gstin: "",
                billingEmail: "studio@example.com",
            }),
            null,
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Asha Verma Studio is added.",
        );
        expect(refresh).toHaveBeenCalled();
    });
});
