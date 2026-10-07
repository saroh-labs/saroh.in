// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_OFFER, WAITLIST_MONEY } from "@/content/waitlist";

/**
 * The waitlist page draws the API's launch offer (marketing plan U31): the
 * plan and days come from `GET /public/waitlist/offer`, the words from
 * `content/waitlist.ts`. With no offer it keeps "Offer details announced at
 * launch". It reads no query, so it renders statically. Plan B and 37 days
 * are made up.
 */
const readLaunchOffer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/launch-offer", () => ({ readLaunchOffer }));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("next/font/local", () => ({
    default: () => ({ variable: "font-local", className: "font-local" }),
}));

afterEach(() => {
    cleanup();
    readLaunchOffer.mockReset();
    vi.useRealTimers();
});

async function renderPage() {
    const page = await import("./page");
    const WaitlistPage = page.default;
    // Static, with no regeneration: the site is rebuilt to change it.
    expect("revalidate" in page).toBe(false);
    // A static page takes no props: no searchParams to make it dynamic.
    expect(WaitlistPage.length).toBe(0);
    return render(await WaitlistPage());
}

describe("/waitlist", () => {
    it("shows the API's launch offer in the card's lead and terms", async () => {
        readLaunchOffer.mockResolvedValue({ planName: "Plan B", days: 37 });
        await renderPage();

        expect(
            screen.getByText("37 days of Plan B free").parentElement
                ?.textContent,
        ).toBe("Get 37 days of Plan B free when we open.");
        expect(screen.queryByText(new RegExp(NO_OFFER.note))).toBeNull();
        expect(
            screen.getByText(
                /No card needed\. When it ends, you stay on Free unless you choose a plan\./,
            ),
        ).toBeTruthy();
    });

    it("without an offer, keeps 'Offer details announced at launch'", async () => {
        readLaunchOffer.mockResolvedValue(null);
        await renderPage();

        expect(
            screen.getByText(NO_OFFER.headline).parentElement?.textContent,
        ).toBe(`Get ${NO_OFFER.headline} when we open. ${NO_OFFER.note}`);
        expect(screen.queryByText(/days of/)).toBeNull();
        expect(screen.queryByText(/No card needed/)).toBeNull();
    });

    it("says the money goes straight to them, and links Integrations once it is shown", async () => {
        readLaunchOffer.mockResolvedValue(null);
        vi.useFakeTimers({ toFake: ["Date"] });
        // 5 Oct, midnight in India: Integrations is published.
        vi.setSystemTime(new Date("2026-10-04T18:30:00.000Z"));
        await renderPage();
        const link = screen.getByRole("link", { name: /See integrations/ });
        expect(link.getAttribute("href")).toBe("/integrations");
        expect(link.parentElement?.textContent).toBe(
            `${WAITLIST_MONEY.line} See integrations`,
        );
    });

    it("keeps the line but draws no link before Integrations is published", async () => {
        readLaunchOffer.mockResolvedValue(null);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-10-04T18:29:59.999Z"));
        await renderPage();
        expect(screen.getByText(WAITLIST_MONEY.line)).toBeTruthy();
        expect(
            screen.queryByRole("link", { name: /See integrations/ }),
        ).toBeNull();
    });
});
