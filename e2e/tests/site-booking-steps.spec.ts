// @covers site:/book api:bookings api:site-accounts pkg:site-blocks
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { ignoreHTTPSErrors, urls } from "../playwright.config";
import {
    asNewVisitor,
    bookUntilOurs,
    nameThenBook,
    signInOnSheet,
} from "./site-codes";

/**
 * The booking step in the address (site templates v2 U9, #1098): each step
 * is a history entry, so the browser's Back and Forward walk the steps with
 * no server render, a reload stays where it was, and a copied link opens
 * on its step for someone else. The page keeps its look (Classic).
 *
 * Walking the steps books nothing, so it runs on Kavi Dental, whose
 * check-up two dentists take (a "who" step): read only, a film set. The
 * pay-now hold that survives a step back is a real hold, so it runs on
 * Northwind Supply, the base seed's site, and lets the hold go after.
 *
 * Northwind's days are shared with `public-booking.spec.ts`, which takes
 * the FIRST time of its days counted back from the furthest (desk 1–4,
 * phone 5–8). This takes the LAST time of its day 1 (phone: 5), so the two
 * never ask for the same time at the same moment.
 */

function siteFor(subdomain: string): string {
    const renderer = new URL(urls.RENDERER_URL);
    return `${renderer.protocol}//${subdomain}.${renderer.host}`;
}
const KAVI = siteFor("kavi-dental");
const NORTHWIND = siteFor("northwind");
const CHECK_UP = "Check-up and clean";
const WALKTHROUGH = "Warehouse walkthrough";

const stepOf = (page: Page) => new URL(page.url()).searchParams.get("step");

/** A free time on the chosen day: its radio, by "9:30 am" and its person. */
const timeRadios = (page: Page) =>
    page.locator('[role="radiogroup"] button[role="radio"]', {
        hasText: /^\d{1,2}:\d{2} [ap]m$/,
    });

/**
 * Service, then person, then time, on Kavi's check-up: each moves the step
 * in the address. Returns the time's label.
 */
async function serviceThenPersonThenTime(page: Page): Promise<string> {
    // `?step=what`: the flow itself, even where a site dresses a plain
    // `/book` with its own Book page.
    await page.goto(`${KAVI}/book?step=what`);
    await page.getByRole("radio", { name: new RegExp(CHECK_UP) }).click();
    await expect(page).toHaveURL(/step=who/);
    const withGroup = page.getByRole("radiogroup", { name: "With" });
    await expect(withGroup).toBeVisible({ timeout: 15_000 });
    const person = withGroup.getByRole("radio").nth(1);
    await person.click();
    await expect(page).toHaveURL(/step=when/);
    await expect(page).toHaveURL(/staff=/);
    const time = timeRadios(page).first();
    await expect(time).toBeVisible({ timeout: 15_000 });
    const label = (await time.innerText()).trim();
    await time.click();
    await expect(page).toHaveURL(/step=details/);
    await expect(time).toHaveAttribute("aria-checked", "true");
    return label;
}

test.describe("the booking step in the address", () => {
    test.beforeEach(({ page }) => asNewVisitor(page));

    test("service → person → time, then Back returns to the person with the service kept, and Forward again", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        // Every step is the History API's: the page itself is never asked
        // for again while the steps move.
        const documents: string[] = [];
        page.on("request", (r) => {
            if (r.resourceType() === "document") documents.push(r.url());
        });
        const label = await serviceThenPersonThenTime(page);
        expect(documents).toHaveLength(1);

        await page.goBack();
        await expect.poll(() => stepOf(page)).toBe("when");
        await expect(
            page.getByRole("radio", { name: new RegExp(CHECK_UP) }),
        ).toHaveAttribute("aria-checked", "true");
        // The person is still chosen; the time is not.
        const withGroup = page.getByRole("radiogroup", { name: "With" });
        await expect(withGroup.getByRole("radio").nth(1)).toHaveAttribute(
            "aria-checked",
            "true",
        );
        await expect(
            timeRadios(page).filter({ hasText: label }).first(),
        ).toHaveAttribute("aria-checked", "false");
        // Focus is on the step's own heading.
        await expect(
            page.getByRole("heading", { name: "When?" }),
        ).toBeFocused();

        await page.goBack();
        await expect.poll(() => stepOf(page)).toBe("who");
        await expect(
            withGroup.getByRole("radio", { name: "Anyone" }),
        ).toHaveAttribute("aria-checked", "true");
        await expect(
            page.getByRole("radio", { name: new RegExp(CHECK_UP) }),
        ).toHaveAttribute("aria-checked", "true");

        await page.goForward();
        await page.goForward();
        await expect.poll(() => stepOf(page)).toBe("details");
        await expect(
            timeRadios(page).filter({ hasText: label }).first(),
        ).toHaveAttribute("aria-checked", "true");
        expect(documents).toHaveLength(1);
    });

    test("a reload on the time step keeps the choices", async ({ page }) => {
        test.setTimeout(90_000);
        const label = await serviceThenPersonThenTime(page);
        const address = page.url();
        await page.reload();
        await expect(
            timeRadios(page).filter({ hasText: label }).first(),
        ).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
        await expect(
            page.getByRole("radio", { name: new RegExp(CHECK_UP) }),
        ).toHaveAttribute("aria-checked", "true");
        expect(page.url()).toBe(address);
    });

    test("a copied link to the time step opens there for a new visitor", async ({
        page,
        browser,
    }) => {
        test.setTimeout(90_000);
        const label = await serviceThenPersonThenTime(page);
        const link = page.url();
        // Nothing private rides in it.
        expect(link).not.toMatch(/email|phone|note|token|code=/i);

        const other = await browser.newContext({ ignoreHTTPSErrors });
        const visitor = await other.newPage();
        await asNewVisitor(visitor);
        await visitor.goto(link);
        await expect(
            timeRadios(visitor).filter({ hasText: label }).first(),
        ).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
        await expect(
            visitor.getByRole("heading", { name: "Your details" }),
        ).toBeVisible();
        expect(stepOf(visitor)).toBe("details");
        await other.close();
    });

    test("a class from the timetable opens booking on details with the class chosen", async ({
        page,
    }) => {
        test.setTimeout(90_000);
        // The timetable links each session as `sessionHref` writes it
        // (`timetable-read.ts`, pinned in the blocks' tests): the class,
        // its day and time in the business's zone, and `step=details`.
        // Pulse Fitness's classes, read only.
        const pulse = siteFor("pulse-fitness");
        await page.goto(`${pulse}/book?step=what`);
        const services = page.getByRole("radiogroup", {
            name: "What would you like?",
        });
        const count = await services.getByRole("radio").count();
        let session: { serviceId: string; date: string; time: string } | null =
            null;
        for (let i = 0; i < count && !session; i += 1) {
            const read = page.waitForResponse((r) =>
                /\/public\/services\/[^/]+\/days/.test(r.url()),
            );
            await services.getByRole("radio").nth(i).click();
            const res = await read;
            const days = (await res.json()) as {
                kind: string;
                timezone: string;
                days: {
                    starts: { startAt: string; placesLeft: number | null }[];
                }[];
            };
            if (days.kind !== "class") continue;
            const open = days.days
                .flatMap((d) => d.starts)
                .find((s) => (s.placesLeft ?? 0) > 0);
            if (!open) continue;
            const parts = new Intl.DateTimeFormat("en-GB", {
                timeZone: days.timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
            }).formatToParts(new Date(open.startAt));
            const part = (type: string) =>
                parts.find((p) => p.type === type)?.value ?? "";
            session = {
                serviceId: new URL(res.url()).pathname.split("/")[3] ?? "",
                date: `${part("year")}-${part("month")}-${part("day")}`,
                time: `${part("hour")}:${part("minute")}`,
            };
        }
        expect(session, "a Pulse class with a place").not.toBeNull();
        if (!session) return;

        const q = new URLSearchParams({
            service: session.serviceId,
            date: session.date,
            start: session.time,
            step: "details",
        });
        await page.goto(`${pulse}/book?${q.toString()}`);
        await expect(
            page.getByRole("heading", { name: "Your details" }),
        ).toBeVisible({ timeout: 15_000 });
        // The details are drawn only once a session is chosen.
        await expect(
            services.getByRole("radio", { checked: true }),
        ).toHaveCount(1);
        expect(stepOf(page)).toBe("details");
    });

    test("a pay-now hold survives a step back: nothing is let go, and Forward pays it", async ({
        page,
        request,
    }, testInfo) => {
        test.setTimeout(150_000);
        const phone = testInfo.project.name.startsWith("phone");
        const email = `steps-${stamp(testInfo)}@example.in`;

        await page.goto(`${NORTHWIND}/book`);
        await page
            .getByRole("radio", { name: new RegExp(WALKTHROUGH) })
            .click();
        const openDays = page.getByRole("radio", { name: /times? free/ });
        await expect(openDays.first()).toBeVisible({ timeout: 15_000 });
        const count = await openDays.count();
        await openDays.nth(count - (phone ? 5 : 1)).click();
        const time = timeRadios(page).last();
        await expect(time).toBeVisible({ timeout: 15_000 });
        await time.click();
        await expect(page).toHaveURL(/step=details/);
        await expect(
            page.getByRole("radio", { name: /^Pay ₹\S+ now Online/ }),
        ).toHaveAttribute("aria-checked", "true");

        const intent = page.waitForRequest((r) =>
            r.url().includes("/payment-intent"),
        );
        await page
            .getByRole("button", { name: "Continue to sign in" })
            .first()
            .click();
        await signInOnSheet(page, email);
        await nameThenBook(page, "Asha Rao");
        // The last free time is a guess another test can take first: on a
        // refusal, the next free time is booked instead.
        await bookUntilOurs(
            page,
            page.getByRole("heading", { name: /to confirm your place$/ }),
        );
        const payToken =
            new URL((await intent).url()).pathname.split("/")[3] ?? "";
        expect(payToken).toBeTruthy();
        await expect.poll(() => stepOf(page)).toBe("pay");
        // The address never carries the hold's token or the email.
        expect(page.url()).not.toContain(payToken);
        expect(page.url()).not.toContain("example.in");

        const holdState = async () =>
            (
                (await (
                    await request.get(
                        `${urls.API_URL}/public/services/holds/${payToken}`,
                    )
                ).json()) as { state: string }
            ).state;

        await page.goBack();
        await expect.poll(() => stepOf(page)).toBe("details");
        await expect(
            page.getByRole("heading", { name: "Your details" }),
        ).toBeVisible();
        expect(await holdState()).toBe("HELD");

        await page.goForward();
        await expect.poll(() => stepOf(page)).toBe("pay");
        await expect(
            page.getByRole("heading", { name: /to confirm your place$/ }),
        ).toBeVisible();
        expect(await holdState()).toBe("HELD");

        // Nothing was paid for real: let the hold go.
        await request.post(
            `${urls.API_URL}/public/services/holds/${payToken}/release`,
        );
    });
});
