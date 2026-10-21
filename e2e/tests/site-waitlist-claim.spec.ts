// @covers site:/book/claim/[token] site:/book api:site-accounts api:bookings pkg:site-blocks
import { createHmac } from "node:crypto";

import type {
    APIRequestContext,
    Browser,
    Page,
    TestInfo,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, phone, stamp } from "../fixtures/own-data";
import type { OwnService } from "../fixtures/own-service";
import { bookOnOwn } from "../fixtures/own-service";
import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor, expectNoZoomOnFocus, signInOnSheet } from "./site-codes";

/**
 * The waitlist offer's claim link (automatic notices U18, #1149): the
 * offer's email links `/book/claim/<token>` on the business's site, which
 * shows the class with "Book my spot until …"; booking it through the
 * normal path takes the place (the line's row goes), and the link then
 * says it was used. A hold that has ended says "This offer has ended" with
 * "Join the waitlist again", and the link opened on another business's
 * site is not found.
 *
 * Owns its data on Northwind: a class of two made for this test, filled by
 * two bookings by hand, a new customer in its line, and one of the two
 * cancelled so the place is offered to them. The link is the one the email
 * carries: the test signs it with the stack's site code secret, as the API
 * does (`waitlist-claim.ts`), from the entry the team's roster names.
 * A place taken while held ("This spot has gone") is the API's db spec.
 */

function siteFor(subdomain: string): string {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//${subdomain}.${renderer.host}`;
}
const NORTHWIND = siteFor("northwind");
const KAVI = siteFor("kavi-dental");

/**
 * The stack's site code secret: CI's throwaway (set for the API and this
 * runner alike), else the API's development fallback for a local stack.
 */
const SECRET =
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- the stack's own test secret, read only here; not a build input
    process.env.SITE_ACCOUNTS_CODE_SECRET ??
    "saroh-dev-insecure-site-code-secret-not-for-production";

/** The claim link's token, as `signClaimToken` makes it. */
function claimToken(entryId: string, until: number): string {
    const sig = createHmac("sha256", SECRET)
        .update(`waitlist-claim\nv1\n${entryId}\n${until}`)
        .digest("base64url");
    return ["v1", entryId, until, sig].join(".");
}

/** "2026-10-27" and "11:00" for an instant, in Kolkata. */
function inKolkata(iso: string): { date: string; time: string } {
    const at = new Date(iso);
    const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(at);
    return { date, time };
}

/** "6:30 pm", as the site says a time. */
function timeWords(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    })
        .format(new Date(iso))
        .toLowerCase()
        .replace(/\s+/g, " ");
}

interface Row {
    id: string;
    status: "WAITING" | "OFFERED";
    offeredUntil: string | null;
}

/**
 * A class of two on the booking page, open all day, every day, free, and
 * online so opening hours never refuse a time; full at `startAt` with two
 * bookings by hand.
 */
async function fullClass(
    request: APIRequestContext,
    testInfo: TestInfo,
): Promise<{
    service: OwnService;
    startAt: string;
    handBookings: string[];
}> {
    const nw = northwind(request);
    const name = `E2E Claim class ${stamp(testInfo)}`;
    const made = await nw.post<{ id: string }>("/services", {
        name,
        durationMinutes: 60,
        capacity: 2,
        priceCents: 0,
        currency: "INR",
        timezone: "Asia/Kolkata",
        locationType: "ONLINE",
        meetingUrl: "https://meet.example.com/e2e-claim",
        showOnBookingPage: true,
    });
    await nw.put(`/services/${made.id}/rules`, {
        rules: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    const service: OwnService = {
        id: made.id,
        name,
        priceCents: 0,
        durationMinutes: 60,
        remove: async () => {
            await nw.delete(`/services/${made.id}`);
        },
    };
    // Two days on, 11:00 in Kolkata: well inside the booking window, and
    // far from the hour before a class when nothing is offered.
    const day = new Date();
    day.setUTCHours(5, 30, 0, 0);
    day.setUTCDate(day.getUTCDate() + 2);
    const startAt = day.toISOString();
    const handBookings: string[] = [];
    for (const who of ["Ira", "Dev"]) {
        const booked = await bookOnOwn(
            request,
            service,
            { name: `${who} ${stamp(testInfo)}`, phone: phone() },
            { startAt },
        );
        handBookings.push(booked.id);
    }
    return { service, startAt, handBookings };
}

/** The class's line for the session, as the team reads it. */
function roster(
    request: APIRequestContext,
    serviceId: string,
    startAt: string,
): Promise<{ rows: Row[] }> {
    return northwind(request).get<{ rows: Row[] }>(
        `/services/${serviceId}/waitlist?startAt=${encodeURIComponent(startAt)}`,
    );
}

/** A new customer joins the full session's line from the booking page. */
async function joinLine(
    page: Page,
    serviceId: string,
    startAt: string,
    email: string,
): Promise<void> {
    const { date, time } = inKolkata(startAt);
    await page.goto(
        `${NORTHWIND}/book?service=${serviceId}&date=${date}&start=${time}`,
    );
    await page
        .getByRole("button", { name: "Continue to sign in" })
        .filter({ visible: true })
        .first()
        .click();
    await signInOnSheet(page, email);
    const joined = page.getByRole("heading", { name: /on the waitlist/ });
    // A new account may be asked its name first, as booking does.
    const name = page.getByLabel("Name");
    await expect(joined.or(name).first()).toBeVisible({ timeout: 15_000 });
    if ((await name.isVisible()) && !(await joined.isVisible())) {
        await expectNoZoomOnFocus(name);
        await name.fill("Sneha Pillai");
        // The sheet may finish joining by itself once it has a name: click
        // Join only while it is still there.
        const join = page
            .getByRole("button", { name: /^Join (the )?waitlist$/ })
            .filter({ visible: true })
            .first();
        await expect(joined.or(join).first()).toBeVisible({ timeout: 15_000 });
        if (!(await joined.isVisible())) await join.click();
    }
    await expect(joined).toBeVisible({ timeout: 15_000 });
}

/** The owner's side: their own context, so the visitor's page stays theirs. */
async function ownerRequest(
    browser: Browser,
): Promise<{ request: APIRequestContext; close: () => Promise<void> }> {
    const context = await browser.newContext({
        baseURL: urls.APP_URL,
        ignoreHTTPSErrors,
    });
    const page = await context.newPage();
    await useSession(page, "owner");
    return { request: page.request, close: () => context.close() };
}

test.describe("the waitlist offer's claim link (#1149)", () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("opens the class with Book my spot, books the place, and is then spent; an ended hold and another business's site say so", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(150_000);
        // The owner's calls go in their own signed-in context, so the page
        // stays a new visitor to the site.
        const owner = await ownerRequest(browser);
        const request = owner.request;
        const { service, startAt, handBookings } = await fullClass(
            request,
            testInfo,
        );
        try {
            const email = `claim-${stamp(testInfo)}@example.com`;
            await joinLine(page, service.id, startAt, email);

            // A place frees: the first in line is offered it.
            const nw = northwind(request);
            const freed = await nw.delete(
                `/services/bookings/${handBookings[0]}`,
            );
            expect(freed.ok(), await freed.text()).toBe(true);
            let offer: Row | undefined;
            await expect
                .poll(
                    async () => {
                        const { rows } = await roster(
                            request,
                            service.id,
                            startAt,
                        );
                        offer = rows.find((r) => r.status === "OFFERED");
                        return offer?.offeredUntil ?? null;
                    },
                    { timeout: 30_000 },
                )
                .not.toBeNull();
            if (!offer?.offeredUntil) throw new Error("no offer was made");
            const entry = offer;
            const until = offer.offeredUntil;
            const token = claimToken(entry.id, Date.parse(until));

            // Another business's site: not found.
            const elsewhere = await page.goto(`${KAVI}/book/claim/${token}`);
            expect(elsewhere?.status()).toBe(404);

            // A link whose hold has ended.
            await page.goto(
                `${NORTHWIND}/book/claim/${claimToken(entry.id, Date.now() - 60_000)}`,
            );
            await expect(
                page.getByRole("heading", { name: "This offer has ended" }),
            ).toBeVisible();
            await expect(
                page.getByRole("link", { name: "Join the waitlist again" }),
            ).toBeVisible();

            // The offer's own link: the class, and the hold's end.
            const claim = await page.goto(`${NORTHWIND}/book/claim/${token}`);
            expect(claim?.headers()["x-robots-tag"]).toContain("noindex");
            await expect(
                page.getByRole("heading", { level: 1, name: service.name }),
            ).toBeVisible();
            const book = page.getByRole("link", {
                name: `Book my spot until ${timeWords(until)}`,
            });
            await expect(book).toBeVisible();
            await book.click();

            // The booking page, on that session, held for them.
            await expect(page).toHaveURL(/\/book\?service=/);
            const held = page.getByRole("radio", {
                name: /Held for you until/,
            });
            await expect(held).toHaveAttribute("aria-checked", "true", {
                timeout: 15_000,
            });
            await expect(page.getByText(/That time has gone/)).toHaveCount(0);
            // An account that joined the line without a name is asked for
            // one before booking, as any booking does.
            const bookName = page
                .getByLabel("Name")
                .filter({ visible: true })
                .first();
            if (
                (await bookName.count()) > 0 &&
                !(await bookName.inputValue())
            ) {
                await bookName.fill("Sneha Pillai");
            }
            await page
                .getByRole("button", { name: /^Book/ })
                .filter({ visible: true })
                .first()
                .click();
            await expect(
                page.getByRole("heading", { name: /You're booked/ }),
            ).toBeVisible({ timeout: 30_000 });

            // The place is taken: out of the line, and the link is spent.
            const { rows } = await roster(request, service.id, startAt);
            expect(rows.some((r) => r.id === entry.id)).toBe(false);
            await page.goto(`${NORTHWIND}/book/claim/${token}`);
            await expect(
                page.getByRole("heading", { name: "You've booked this place" }),
            ).toBeVisible();
            await expect(
                page.getByRole("link", { name: /Book my spot/ }),
            ).toHaveCount(0);
        } finally {
            await service.remove();
            await owner.close();
        }
    });

    test("a link that isn't one is the site's own not found", async ({
        page,
    }) => {
        const res = await page.goto(`${NORTHWIND}/book/claim/not-a-token`);
        expect(res?.status()).toBe(404);
        await expect(
            page.getByRole("heading", { name: /find that page/ }),
        ).toBeVisible();
    });
});
