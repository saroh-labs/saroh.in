// @covers accounts:/login app:/open app:/customers app:/commerce/orders app:/commerce/orders/new app:/billing/invoices app:/billing/subscriptions app:/settings/people api:customer-workspace api:contacts api:customers api:orders api:payments api:invoices api:subscriptions api:organizations
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
    phone as aPhone,
    makeContact,
    makeOrder,
    northwind,
    ORDER_LINE,
    orderLine,
    stamp as ownStamp,
} from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG, refundOrder, urls } from "../playwright.config";

/**
 * Dialogs and sheets on a phone, with the values real businesses have
 * (pre-launch polish P2).
 *
 * On a phone, "Link a commerce customer" put a long email on one line and
 * pushed its Link button off the screen: a grid item's `min-width: auto`
 * let one unbreakable address set the dialog's width. Nothing at desk width
 * shows it, and the seeded names are all short. So each test here makes a
 * Northwind record of its own with a 60-character email and a long name,
 * opens the dialogs and sheets on the screens a merchant uses on a phone,
 * and at 320px (the floor) and 390px asserts that
 *
 * - the page never scrolls sideways (`scrollWidth <= innerWidth`), and
 * - every button in the dialog sits inside the screen's width, and its
 *   primary and secondary actions, scrolled to, sit wholly inside the
 *   screen.
 *
 * Phone project only: the desk has room for anything. Nothing here is
 * saved but the records each test makes for itself; every dialog is left
 * with its secondary action.
 */

const WIDTHS = [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
] as const;

// The phone project (a Pixel 7) is the mobile one; the desk has room for
// any value.
test.skip(({ isMobile }) => !isMobile, "Phone widths only.");

/**
 * A 60-character email no other test holds: a long real-world address,
 * with this test's stamp in it. No hyphen, where a line may break: most
 * addresses have none, so nothing but the layout can wrap one.
 */
function longEmail(s: string): string {
    const domain = "@venkataramanhospitality.example.in";
    const local = `aishwarya.${s}`.replace(/[^a-z0-9.]/gi, "").toLowerCase();
    const email = `${local}${domain}`;
    const padded =
        email.length >= 60
            ? email
            : `${local}${"x".repeat(60 - email.length)}${domain}`;
    expect(padded.length).toBeGreaterThanOrEqual(60);
    return padded;
}

/** A long real-world name, stamped. */
function longName(s: string) {
    return {
        firstName: "Aishwarya Lakshmi",
        lastName: `Venkataraman-Subramaniam ${s}`,
    };
}

async function signIn(page: Page) {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
}

/** A Northwind contact of this test's own, with the long values. */
async function longContact(page: Page, testInfo: TestInfo, phone?: string) {
    const s = ownStamp(testInfo);
    const email = longEmail(s);
    const contact = await makeContact(page.request, {
        ...longName(s),
        email,
        ...(phone ? { phone } : {}),
    });
    return { ...contact, email };
}

/** The screen's width, as set: never `innerWidth` (see below). */
function screenWidth(page: Page): number {
    const view = page.viewportSize();
    if (!view) throw new Error("No viewport");
    return view.width;
}

/**
 * The page does not scroll sideways.
 *
 * Measured against the width the screen was set to, not `innerWidth`: on a
 * mobile viewport, content wider than the screen makes Chrome zoom the page
 * out and widen its layout viewport to match, so `innerWidth` grows with
 * the overflow and `scrollWidth <= innerWidth` passes on the very bug.
 */
async function noSidewaysScroll(page: Page, where: string) {
    const width = screenWidth(page);
    const { scrollWidth, innerWidth, culprits } = await page.evaluate((w) => {
        // What sticks out, for the failure message: the innermost boxes
        // past the right edge, and the innermost boxes whose own text runs
        // out of them (a long email in a paragraph keeps the paragraph's
        // box and spills). Skipped: what a container of its own scrolls or
        // clips, and fixed bars, which follow a zoomed-out page.
        const contained = (el: Element) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
                if (p === document.body) return false;
                const style = getComputedStyle(p);
                if (style.overflowX !== "visible") return true;
                if (style.position === "fixed") return true;
            }
            return false;
        };
        const past = [...document.querySelectorAll("body *")].filter((el) => {
            if (contained(el) || getComputedStyle(el).position === "fixed")
                return false;
            const r = el.getBoundingClientRect();
            const spills =
                getComputedStyle(el).overflowX === "visible" &&
                el.scrollWidth > el.clientWidth + 1 &&
                el.clientWidth > 0;
            return (r.width > 0 && r.right > w + 1) || spills;
        });
        const leaves = past.filter(
            (el) => !past.some((o) => o !== el && el.contains(o)),
        );
        return {
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
            culprits: leaves.slice(0, 6).map((el) => {
                const r = el.getBoundingClientRect();
                const cls = (el.getAttribute("class") ?? "").slice(0, 60);
                const text = el.textContent.trim().slice(0, 30);
                return `<${el.tagName.toLowerCase()} class="${cls}"> "${text}" [${Math.round(r.left)}–${Math.round(r.right)}]`;
            }),
        };
    }, width);
    const why = culprits.length
        ? `\n  past the edge: ${culprits.join("\n  ")}`
        : "";
    // A pixel of slack for sub-pixel rounding.
    expect(
        innerWidth,
        `${where}: the page was zoomed out to fit something wider than the screen${why}`,
    ).toBeLessThanOrEqual(width + 1);
    expect(
        scrollWidth,
        `${where}: the page scrolls sideways${why}`,
    ).toBeLessThanOrEqual(width + 1);
}

/** Every visible button in `box` lies inside the screen's width. */
async function buttonsWithinWidth(box: Locator, where: string) {
    const outside = await box.evaluate((root, w) => {
        return [
            ...root.querySelectorAll<HTMLElement>(
                "button, [role=button], a[href]",
            ),
        ]
            .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            })
            .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.left < -1 || r.right > w + 1;
            })
            .map((el) => {
                const r = el.getBoundingClientRect();
                const name = (
                    el.getAttribute("aria-label") ??
                    (el.textContent.trim() || el.tagName)
                ).slice(0, 40);
                return `${name} [${Math.round(r.left)}–${Math.round(r.right)} of ${w}]`;
            });
    }, screenWidth(box.page()));
    expect(outside, `${where}: buttons past the screen's edge`).toEqual([]);
}

/** Scrolled to, the button sits wholly inside the screen. */
async function reachable(button: Locator, where: string) {
    await expect(button, `${where}: the button is shown`).toBeVisible();
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    const view = button.page().viewportSize();
    expect(box, `${where}: the button has a box`).not.toBeNull();
    if (!box || !view) return;
    const name = (await button.textContent())?.trim() ?? "";
    const at = `${where}: "${name}" at ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)} in ${view.width}×${view.height}`;
    expect(box.x, at).toBeGreaterThanOrEqual(-1);
    expect(box.y, at).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, at).toBeLessThanOrEqual(view.width + 1);
    expect(box.y + box.height, at).toBeLessThanOrEqual(view.height + 1);
}

/**
 * The dialog has stopped moving: its animations (a sheet slides in, a
 * dialog zooms) are done and its box reads the same twice running.
 */
async function settled(box: Locator) {
    await box.evaluate((el) =>
        Promise.all(
            el
                .getAnimations({ subtree: true })
                .map((a) => a.finished.catch(() => undefined)),
        ),
    );
    let last = "";
    await expect
        .poll(
            async () => {
                const now = JSON.stringify(await box.boundingBox());
                const same = now === last;
                last = now;
                return same;
            },
            { intervals: [100], timeout: 5_000 },
        )
        .toBe(true);
}

/**
 * At each width: no sideways scroll, every button in the dialog inside the
 * width, and its actions reachable. The dialog stays open across widths, as
 * a phone turned or a window narrowed would leave it.
 */
async function fitsAtPhoneWidths(
    page: Page,
    box: Locator,
    actions: Locator[],
    where: string,
) {
    for (const size of WIDTHS) {
        await page.setViewportSize(size);
        const at = `${where} at ${size.width}px`;
        await expect(box, at).toBeVisible();
        await settled(box);
        await noSidewaysScroll(page, at);
        await buttonsWithinWidth(box, at);
        for (const action of actions) await reachable(action, at);
    }
}

test.describe("phone reflow: Customer Detail", () => {
    test("Link a commerce customer keeps Link on the screen with a long email", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const who = await longContact(page, testInfo);
        // An order under the same email makes the commerce customer the
        // dialog offers to link.
        await makeOrder(page.request, {
            paid: false,
            customer: { email: who.email, name: who.name },
        });
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/customers/${who.id}`);
        await expect(page.getByText("Possible match — link?")).toBeVisible();
        await noSidewaysScroll(page, "Customer Detail with a long email");
        await page.getByRole("button", { name: "Review and link" }).click();
        const dialog = page.getByRole("dialog", {
            name: "Link a commerce customer",
        });
        // The whole address is on the screen, not cut off.
        await expect(
            dialog.getByText(who.email, { exact: false }),
        ).toBeVisible();
        await fitsAtPhoneWidths(
            page,
            dialog,
            [
                dialog.getByRole("button", { name: "Link", exact: true }),
                dialog.getByRole("button", { name: "Close" }),
            ],
            "Link a commerce customer",
        );
        await dialog.getByRole("button", { name: "Close" }).click();
        await expect(dialog).toHaveCount(0);
    });

    test("Merge with a duplicate fits a phone with long names", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const phone = aPhone();
        const kept = await longContact(page, testInfo, phone);
        await longContact(page, testInfo, phone);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/customers/${kept.id}`);
        const notice = page.getByRole("note").filter({
            hasText: "Looks like the same person",
        });
        await noSidewaysScroll(page, "Customer Detail with a duplicate");
        await notice.getByRole("button", { name: "Merge…" }).click();
        const dialog = page.getByRole("dialog", {
            name: "Merge with a duplicate",
        });
        const merge = dialog.getByRole("button", {
            name: "Merge",
            exact: true,
        });
        await expect(merge).toBeEnabled();
        await fitsAtPhoneWidths(
            page,
            dialog,
            [merge, dialog.getByRole("button", { name: "Cancel" })],
            "Merge with a duplicate",
        );
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toHaveCount(0);
    });

    test("Edit details keeps Save and Cancel on the screen with a long email and address", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const who = await longContact(page, testInfo);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/customers/${who.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();
        const sheet = page.getByRole("dialog", { name: "Edit details" });
        await expect(sheet.getByLabel("Email")).toHaveValue(who.email);
        // A long address line, typed: Save wakes up.
        await sheet
            .getByLabel(/^(Street|Address|Line 1|Street and number)/)
            .first()
            .fill(
                "Flat 1204, Tower B, Prestige Lakeside Habitat, Varthur Main Road, Gunjur",
            );
        await fitsAtPhoneWidths(
            page,
            sheet,
            [
                sheet.getByRole("button", { name: "Save" }),
                sheet.getByRole("button", { name: "Cancel" }),
            ],
            "Edit details",
        );
    });
});

test.describe("phone reflow: Order Detail", () => {
    /** A hand-paid pick-up order for the long-named customer. */
    async function longOrder(page: Page, testInfo: TestInfo) {
        const s = ownStamp(testInfo);
        const { firstName, lastName } = longName(s);
        const { id } = await makeOrder(page.request, {
            customer: { email: longEmail(s), name: `${firstName} ${lastName}` },
        });
        return id;
    }

    test("Refund fits a phone", async ({ page }) => {
        // A refund by line needs a payment taken through a provider, which
        // a dev stack has none of (as in order-detail.spec.ts): it runs when
        // E2E_REFUND_ORDER_ID names one. The cancel below refunds a
        // hand-paid order's money in its own panel either way.
        const id = refundOrder.id;
        test.skip(
            !id,
            "Needs a provider-paid order (E2E_REFUND_ORDER_ID); a dev stack takes no provider payments.",
        );
        await useSession(page);
        await page.goto(`/open/${refundOrder.org ?? NORTHWIND_ORG}`);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/commerce/orders/${id}`);
        await page.getByRole("button", { name: "Refund…" }).click();
        const refund = page.getByRole("region", { name: "Refund" });
        await fitsAtPhoneWidths(
            page,
            refund,
            [
                refund.getByRole("button", { name: /^Refund / }),
                refund.getByRole("button", { name: "Cancel" }),
            ],
            "Refund",
        );
        await refund.getByRole("button", { name: "Cancel" }).click();
    });

    test("Cancel (with its refund) and Edit fit a phone", async ({
        page,
    }, testInfo) => {
        test.setTimeout(120_000);
        await signIn(page);
        const id = await longOrder(page, testInfo);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/commerce/orders/${id}`);
        await expect(
            page
                .getByText("Aishwarya Lakshmi")
                .filter({ visible: true })
                .first(),
        ).toBeVisible();
        await noSidewaysScroll(page, "Order Detail with a long name");

        await page.getByRole("button", { name: "Cancel order…" }).click();
        const cancel = page.getByRole("region", { name: /^Cancel #/ });
        await fitsAtPhoneWidths(
            page,
            cancel,
            [
                cancel.getByRole("button", {
                    name: /^(Refund |Cancel order$)/,
                }),
                cancel.getByRole("button", { name: "Cancel", exact: true }),
            ],
            "Cancel order",
        );
        await cancel
            .getByRole("button", { name: "Cancel", exact: true })
            .click();

        await page.setViewportSize(WIDTHS[0]);
        await page
            .getByRole("button", { name: "Edit items or address" })
            .click();
        const edit = page.getByRole("region", { name: "Edit order" });
        await fitsAtPhoneWidths(
            page,
            edit,
            [
                edit.getByRole("button", { name: /^Save/ }),
                edit.getByRole("button", { name: "Cancel", exact: true }),
            ],
            "Edit order",
        );
    });

    test("Change how it's fulfilled fits a phone", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        await signIn(page);
        const id = await longOrder(page, testInfo);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto(`/commerce/orders/${id}`);
        const open = page.getByRole("button", {
            name: "Change how it's fulfilled…",
        });
        test.skip(
            await open.isDisabled(),
            "Northwind's storefront offers one way only for this product.",
        );
        await open.click();
        const sheet = page.getByRole("dialog", {
            name: "Change how it's fulfilled",
        });
        await expect(sheet).toBeVisible();
        await fitsAtPhoneWidths(
            page,
            sheet,
            [
                sheet.getByRole("button", { name: /^Save/ }),
                sheet.getByRole("button", { name: "Cancel", exact: true }),
            ],
            "Change how it's fulfilled",
        );
    });
});

test.describe("phone reflow: New order", () => {
    test("the New order sheet keeps its create button on the screen with a long name", async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        await signIn(page);
        await orderLine(page.request);
        const { firstName, lastName } = longName(ownStamp(testInfo));
        await page.setViewportSize(WIDTHS[0]);
        await page.goto("/commerce/orders?storefront=seed_store");
        await page
            .getByRole("button", { name: "New order" })
            .filter({ visible: true })
            .first()
            .click();
        const sheet = page.getByRole("dialog", { name: "New order" });
        await sheet.getByRole("radio", { name: "Walk-in" }).click();
        await sheet.getByLabel("Name").fill(`${firstName} ${lastName}`);
        await sheet.getByLabel("Add a product").fill(ORDER_LINE);
        await sheet
            .getByRole("group", { name: `Add ${ORDER_LINE}` })
            .getByRole("button")
            .first()
            .click();
        await expect(sheet.getByText("1 item")).toBeVisible();
        await fitsAtPhoneWidths(
            page,
            sheet,
            [sheet.getByRole("button", { name: /create$/ })],
            "New order",
        );
    });
});

test.describe("phone reflow: invoices", () => {
    test("the send confirm keeps Send it and Not now on the screen with a long email", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const who = await longContact(page, testInfo);
        const nw = northwind(page.request);
        const draft = await nw.post<{ id: string }>("/invoices", {
            contactId: who.id,
            currency: "INR",
            lines: [
                {
                    description:
                        "Catering for the Venkataraman-Subramaniam engagement lunch",
                    quantity: 1,
                    unitPrice: "450.00",
                },
            ],
        });
        try {
            await page.setViewportSize(WIDTHS[0]);
            await page.goto(`/billing/invoices/${draft.id}`);
            // The paper, with the address on it, drawn before measuring.
            await expect(
                page.getByRole("article", { name: /as it prints$/ }),
            ).toContainText(who.email);
            await noSidewaysScroll(page, "a draft invoice with a long email");
            await page
                .getByRole("button", { name: "Send with pay link" })
                .filter({ visible: true })
                .first()
                .click();
            const confirm = page.getByRole("alertdialog");
            await expect(confirm).toContainText(who.email);
            await fitsAtPhoneWidths(
                page,
                confirm,
                [
                    confirm.getByRole("button", { name: "Send it" }),
                    confirm.getByRole("button", { name: "Not now" }),
                ],
                "Send invoice",
            );
            await confirm.getByRole("button", { name: "Not now" }).click();
            await expect(confirm).toHaveCount(0);
        } finally {
            // A draft has no number: deleting it leaves nothing behind.
            await nw.delete(`/invoices/${draft.id}`);
        }
    });
});

test.describe("phone reflow: subscriptions", () => {
    test("Change plan keeps its actions on the screen with long plan names", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        const nw = northwind(page.request);
        const s = ownStamp(testInfo);
        const plan = async (name: string, price: string) =>
            nw.post<{ id: string }>("/subscription-plans", {
                name,
                price,
                currency: "INR",
                interval: "MONTH",
            });
        const mine = await plan(
            `E2E Weekly sourdough and seasonal bakes box ${s}`,
            "800",
        );
        const other = await plan(
            `E2E Fortnightly celebration cakes and pastries ${s}`,
            "1200",
        );
        try {
            const who = await longContact(page, testInfo);
            const made = await nw.post<{
                id?: string;
                subscription?: { id: string };
            }>("/subscriptions", {
                contactId: who.id,
                planId: mine.id,
                collectionWeekday: 6,
                collectionNote: "1 box",
            });
            const id = made.subscription?.id ?? made.id ?? "";
            expect(id).toBeTruthy();

            await page.setViewportSize(WIDTHS[0]);
            await page.goto(`/billing/subscriptions/${id}?do=switch`);
            const sheet = page.getByRole("dialog", { name: "Change plan" });
            await expect(sheet).toBeVisible();
            await sheet
                .getByRole("radio")
                .filter({ hasText: "Fortnightly celebration cakes" })
                .click();
            await fitsAtPhoneWidths(
                page,
                sheet,
                [
                    sheet.getByRole("button", {
                        name: "Change from next renewal",
                    }),
                    sheet
                        .getByRole("button", { name: /^(Cancel|Keep|Not now)/ })
                        .first(),
                ],
                "Change plan",
            );
        } finally {
            // A live plan is never deleted; archived, nobody new joins it.
            for (const p of [mine, other]) {
                await page.request.post(
                    `${urls.API_URL}/organizations/${NORTHWIND_ORG}/subscription-plans/${p.id}/archive`,
                    { headers: nw.headers },
                );
            }
        }
    });
});

test.describe("phone reflow: Settings › Team", () => {
    test("Invite keeps Send invite and Cancel on the screen with a long email", async ({
        page,
    }, testInfo) => {
        await signIn(page);
        await page.setViewportSize(WIDTHS[0]);
        await page.goto("/settings/people");
        await page
            .getByRole("button", { name: "Invite someone" })
            .filter({ visible: true })
            .first()
            .click();
        const dialog = page.getByRole("dialog", { name: /^Invite to / });
        await dialog.getByLabel("Email").fill(longEmail(ownStamp(testInfo)));
        await fitsAtPhoneWidths(
            page,
            dialog,
            [
                dialog.getByRole("button", { name: "Send invite" }),
                dialog.getByRole("button", { name: "Cancel" }),
            ],
            "Invite",
        );
        // Nothing is sent.
        await dialog.getByRole("button", { name: "Cancel" }).click();
        await expect(dialog).toHaveCount(0);
    });
});
