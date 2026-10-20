import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingPage } from "./booking-page";
import { getCatalogue } from "./catalogue";
import { frontDoorFor } from "./front-door";

/**
 * The way in a look's hero offers beside its button (DEC-172, plan U6,
 * #1094): the booking page while it takes bookings, else the shop while it
 * serves, else none; and Classic, or a page with no hero, never asks.
 */

vi.mock("./booking-page", () => ({ getBookingPage: vi.fn() }));
vi.mock("./catalogue", () => ({ getCatalogue: vi.fn() }));

const books = {
    ok: true,
    page: {
        businessName: "Prana Yoga",
        open: true,
        timezone: "Asia/Kolkata",
        payOnline: false,
        rules: {
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: 12,
        },
        services: [
            {
                id: "svc_hatha",
                name: "Hatha yoga",
                description: null,
                durationMinutes: 60,
                kind: "class",
                capacity: 16,
                priceCents: 60_000,
                currency: "INR",
                online: false,
                staff: ["Meera Iyer"],
            },
        ],
    },
} as const;

const HERO = [{ type: "hero", content: { heading: "Yoga at your pace." } }];

beforeEach(() => {
    vi.mocked(getBookingPage).mockReset();
    vi.mocked(getCatalogue).mockReset();
});

describe("a look's front door", () => {
    it("is the booking page while the business takes bookings", async () => {
        vi.mocked(getBookingPage).mockResolvedValue(books as never);
        vi.mocked(getCatalogue).mockResolvedValue({ ok: true } as never);
        await expect(
            frontDoorFor({ siteId: "site_1", look: "quiet", sections: HERO }),
        ).resolves.toEqual({ kind: "book", href: "/book" });
    });

    it("is the shop for a site that sells and takes no bookings", async () => {
        vi.mocked(getBookingPage).mockResolvedValue({
            ok: false,
            reason: "missing",
        });
        vi.mocked(getCatalogue).mockResolvedValue({ ok: true } as never);
        await expect(
            frontDoorFor({ siteId: "site_1", look: "folio", sections: HERO }),
        ).resolves.toEqual({ kind: "shop", href: "/shop" });
    });

    it("is none for a site that does neither", async () => {
        vi.mocked(getBookingPage).mockResolvedValue({
            ok: false,
            reason: "unavailable",
        });
        vi.mocked(getCatalogue).mockResolvedValue({
            ok: false,
            reason: "unavailable",
        } as never);
        await expect(
            frontDoorFor({ siteId: "site_1", look: "live", sections: HERO }),
        ).resolves.toBeNull();
    });

    it("never reads for Classic, a page with no hero, a page that isn't home, or no live site", async () => {
        await expect(
            frontDoorFor({ siteId: "site_1", look: undefined, sections: HERO }),
        ).resolves.toBeNull();
        await expect(
            frontDoorFor({ siteId: "site_1", look: "quiet", sections: [] }),
        ).resolves.toBeNull();
        await expect(
            frontDoorFor({ siteId: null, look: "quiet", sections: HERO }),
        ).resolves.toBeNull();
        await expect(
            frontDoorFor({
                siteId: "site_1",
                look: "quiet",
                sections: HERO,
                home: false,
            }),
        ).resolves.toBeNull();
        expect(getBookingPage).not.toHaveBeenCalled();
        expect(getCatalogue).not.toHaveBeenCalled();
    });
});
