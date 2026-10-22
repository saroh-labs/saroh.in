/**
 * One of each kind of call site moved onto the named states (UX audit, 10
 * Oct 2026): a segment boundary, a part of a page that couldn't be read, a
 * tab that failed or is out of reach, a switch that is off, a limit, a
 * refused invitation. Each is the right card for its state, said in the one
 * wording, and none is drawn as another.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Plans shown, as the runner has it everywhere else (DEC-136).
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
}));
vi.mock("@saroh/ui/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/components/commerce/stock/turn-on-tracking", () => ({
    TurnOnTracking: () => <button type="button">Turn on Track stock</button>,
}));
vi.mock("@/components/commerce/stock/stock-header", () => ({
    StockHeader: () => <h1>Stock</h1>,
}));
vi.mock("@/components/organizations/team/switch-account-button", () => ({
    SwitchAccountButton: ({ label }: { label: string }) => (
        <button type="button">{label}</button>
    ),
}));

import { ProductLimitReached } from "@/components/commerce/product-limit-reached";
import {
    PanelFailed,
    PanelForbidden,
} from "@/components/commerce/product-page/panel-state";
import { StockTrackingOff } from "@/components/commerce/stock/stock-states";
import { Empty, Failed } from "@/components/customers/detail/parts";
import { InvitationProblemView } from "@/components/organizations/team/invitation-problem";
import { SettingsSectionError } from "@/components/settings/page/settings-section-error";
import { ApiError } from "@/lib/api/errors";
import type { PlanMeter } from "@/lib/billing/meter";
import { FailedRead } from "./failed-read";
import { SectionError } from "./section-error";

const html = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const state = (markup: string) => /data-state="([a-z-]+)"/.exec(markup)?.[1];
const noop = () => undefined;

describe("SectionError, the body of every segment boundary", () => {
    const failed = html(
        <SectionError
            error={Object.assign(new Error("boom"), { digest: "d1g3st" })}
            retry={noop}
            heading="Invoices"
            things="invoices"
            reassurance="Every invoice that was issued is still there."
            backHref="/billing"
            place="Payments"
        />,
    );

    it("keeps the page's heading above the card", () => {
        expect(failed).toMatch(/<h1[^>]*>Invoices<\/h1>/);
    });

    it("is the failed card: an alert, titled one way, saying nothing changed", () => {
        expect(state(failed)).toBe("failed");
        expect(failed).toContain('role="alert"');
        expect(failed).toContain("Couldn't load invoices");
        expect(failed).toContain(
            "Nothing has been changed. Every invoice that was issued is still there.",
        );
    });

    it("offers Try again, the way back by the menu's name, and the reference", () => {
        expect(failed).toMatch(/<button[^>]*>Try again<\/button>/);
        expect(failed).toContain('href="/billing"');
        expect(failed).toContain("Back to Payments");
        expect(failed).toContain("Reference: d1g3st");
    });

    it("draws a 403 as a denial, with nothing to retry", () => {
        const denied = html(
            <SectionError
                error={new ApiError(403, "/invoices")}
                retry={noop}
                things="invoices"
            />,
        );
        expect(state(denied)).toBe("denied");
        expect(denied).not.toContain('role="alert"');
        expect(denied).not.toContain("Try again");
    });

    it("draws a session that ran out as signed out, not as “no access”", () => {
        const out = html(
            <SectionError
                error={new ApiError(401, "/invoices")}
                retry={noop}
            />,
        );
        expect(state(out)).toBe("signed-out");
        expect(out).toContain("Your session has ended");
        expect(out).toContain("Sign in again to pick up where you left off.");
        expect(out).toMatch(/<a[^>]*href="[^"]*\/login"[^>]*>Sign in<\/a>/);
        expect(out).not.toMatch(/role|owner|admin/i);
    });
});

describe("a settings tab that couldn't be read", () => {
    const markup = html(
        <SettingsSectionError
            section="people"
            error={new Error("boom")}
            retry={noop}
        />,
    );

    it("keeps its heading and says the one sentence, then what is true of it", () => {
        expect(markup).toContain("Team");
        expect(state(markup)).toBe("failed");
        expect(markup).toContain("Couldn't load the team");
        expect(markup).toContain(
            "Nothing has been changed. Nobody has been removed and no role has changed.",
        );
        expect(markup).toContain("Try again");
    });
});

describe("a part of a page that couldn't be read", () => {
    it("is one line with Try again, never “reload the page”", () => {
        const markup = html(<FailedRead things="the waitlist" />);
        expect(state(markup)).toBe("failed");
        expect(markup).toContain('data-state-size="inline"');
        expect(markup).toContain('role="alert"');
        expect(markup).toContain("Couldn't load the waitlist.");
        expect(markup).toMatch(/<button[^>]*>Try again<\/button>/);
        expect(markup).not.toMatch(/reload|refresh the page/i);
    });

    it("is the failed card where it is a whole tab", () => {
        const markup = html(<Failed what="Orders" />);
        expect(state(markup)).toBe("failed");
        expect(markup).toContain('data-state-size="panel"');
        expect(markup).toContain("Couldn't load orders");
        expect(markup).not.toContain("border-dashed");
    });
});

describe("a product tab", () => {
    it("that failed is an alert with Try again and the way to the same records", () => {
        const markup = html(
            <PanelFailed
                what="orders"
                retryHref="/commerce/products/p1?tab=orders"
                elsewhere={{ href: "/commerce/orders", label: "Open Orders" }}
            />,
        );
        expect(state(markup)).toBe("failed");
        expect(markup).toContain("Couldn't load orders");
        expect(markup).toMatch(
            /<a[^>]*href="\/commerce\/products\/p1\?tab=orders"[^>]*>Try again<\/a>/,
        );
        expect(markup).toContain("Open Orders");
    });

    it("that the role may not see is the denied card, with who can change it", () => {
        const markup = html(<PanelForbidden what="reviews" />);
        expect(state(markup)).toBe("denied");
        expect(markup).toContain("You can't open reviews");
        expect(markup).toContain(
            "An owner or admin can change this in Settings › Team.",
        );
        expect(markup).not.toContain("border-dashed");
        expect(markup).not.toContain('role="alert"');
    });
});

describe("a customer tab with nothing in it", () => {
    it("is the shared empty card with a title", () => {
        const markup = html(
            <Empty title="No orders yet">They show here.</Empty>,
        );
        expect(state(markup)).toBe("empty");
        expect(markup).toContain('data-state-size="panel"');
        expect(markup).toMatch(/<h3[^>]*>No orders yet<\/h3>/);
    });

    it("is one line when a sentence is all there is to say", () => {
        const markup = html(<Empty>No invoices yet.</Empty>);
        expect(markup).toContain('data-state-size="inline"');
        expect(markup).not.toContain("border-dashed");
    });
});

describe("off and limit", () => {
    it("says Track stock is off, with the switch for someone who may", () => {
        const markup = html(<StockTrackingOff business="Rye" canChange />);
        expect(state(markup)).toBe("off");
        expect(markup).toContain("Track stock is turned off for Rye");
        expect(markup).toContain("Turn on Track stock");
    });

    it("tells anyone else who can turn it on, with no switch", () => {
        const markup = html(
            <StockTrackingOff business="Rye" canChange={false} />,
        );
        expect(markup).not.toContain("<button");
        expect(markup).toContain("An owner or admin can turn it on.");
    });

    it("says where a plan's limit is, with the one plan label", () => {
        const meter: PlanMeter = {
            used: 10,
            limit: 10,
            room: 0,
            full: true,
            label: "10 of 10 products",
            reason: "Your plan holds 10 products. You can't add more.",
            href: "/settings/billing/plans?plan=grow",
            upgradeTo: "Grow",
        };
        const markup = html(<ProductLimitReached meter={meter} />);
        expect(state(markup)).toBe("limit");
        expect(markup).toContain("You're at 10 of 10 products");
        expect(markup).toMatch(/<a[^>]*>See Grow<\/a>/);
        expect(markup).not.toContain("Upgrade to");
        expect(markup).toContain("Back to Products");
    });
});

describe("an invitation that wasn't accepted", () => {
    const view = (
        problem: "unreachable" | "gone" | "wrong-person" | "refused",
    ) =>
        html(
            <InvitationProblemView
                problem={problem}
                refusal="This business's plan has no room for another person."
                invitedEmail="asha@example.com"
                signedInEmail="ravi@example.com"
                retryHref="/join/tok"
            />,
        );

    it.each([
        ["unreachable", "failed"],
        ["gone", "failed"],
        ["refused", "failed"],
        ["wrong-person", "denied"],
    ] as const)("%s is the %s card, never the empty one", (problem, card) => {
        const markup = view(problem);
        expect(state(markup)).toBe(card);
        expect(markup).not.toContain('data-state="empty"');
        expect(markup).not.toContain("border-dashed");
    });

    it("one that couldn't be checked is tried again by loading the page", () => {
        expect(view("unreachable")).toMatch(
            /<a[^>]*href="\/join\/tok"[^>]*>Try again<\/a>/,
        );
    });

    it("one that was refused says why and has a way on", () => {
        const markup = view("refused");
        expect(markup).toContain(
            "This business's plan has no room for another person.",
        );
        expect(markup).toContain("Go to Home");
    });
});
