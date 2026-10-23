// @covers app:/customers site:/account/messages api:customer-workspace api:site-accounts
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";
import { asNewVisitor, signInOnSheet } from "./site-codes";

/**
 * A team reply in Messages is emailed to the customer (DEC-174 U14,
 * #1145): the line under Customer Detail's reply box says where a reply
 * goes, naming the address only when the business's own email sends it,
 * and never "Nothing is emailed" when it is. What the line should say is
 * the API's own read of the thread (`emailedTo`: email connected, "Your
 * replies in Messages" on, an address, their consent), so the claim holds
 * whatever this stack's Northwind has connected.
 *
 * The email itself (held a minute, three replies as one, no provider,
 * switch off, consent) is covered by the API's `team-reply.db.spec.ts`.
 *
 * It makes a new customer of its own (a new email signed in on Northwind's
 * site) and changes nothing else, so desk and phone run beside every other
 * spec. Needs `SITE_ACCOUNT_AREA=on` in both the api and saroh.app.
 */

const NORTHWIND = "seed_org";

test.describe("Messages: where a team reply goes (U14)", () => {
    test.skip(
        process.env.SITE_ACCOUNT_AREA !== "on",
        "SITE_ACCOUNT_AREA is off on this stack",
    );

    test("the line under the reply box names the address a reply is emailed to, or says nothing is", async ({
        page,
        browser,
    }, testInfo) => {
        test.setTimeout(120_000);
        const renderer = new URL(urls.RENDERER_URL);
        const site = `${renderer.protocol}//northwind.${renderer.host}`;
        const email = `u14-${testInfo.project.name}-${Date.now()}@example.com`;
        const asked = `Is the blue crate back in? (${Date.now()})`;
        const answer = `Yes, it came in this morning. (${Date.now()})`;

        // The customer signs in on the site and writes, so the team has a
        // thread to answer.
        const customer = await browser.newContext({ ignoreHTTPSErrors });
        const visitor = await customer.newPage();
        await asNewVisitor(visitor);
        await visitor.goto(`${site}/contact`);
        await visitor
            .getByRole("banner")
            .getByRole("button", { name: "Sign in" })
            .filter({ visible: true })
            .click();
        await signInOnSheet(visitor, email);
        await visitor.goto(`${site}/contact`);
        await visitor.getByLabel("What do you need?").fill(asked);
        await visitor
            .getByRole("button", { name: "Send enquiry" })
            .filter({ visible: true })
            .click();
        await expect(visitor.getByRole("status")).toContainText(/Sent\./);

        // The team, and the API's read of where a reply goes.
        await useSession(page, "owner");
        await page.goto(`/open/${NORTHWIND}`);
        const headers = { "x-organization-id": NORTHWIND };
        const base = `${urls.API_URL}/organizations/${NORTHWIND}`;
        const found = await page.request.get(
            `${base}/customers?q=${encodeURIComponent(email)}`,
            { headers },
        );
        expect(found.ok()).toBe(true);
        const { rows } = (await found.json()) as {
            rows: { contactId: string }[];
        };
        expect(rows).toHaveLength(1);
        const contactId = rows[0]?.contactId ?? "";
        const read = await page.request.get(
            `${base}/customers/${contactId}/thread`,
            { headers },
        );
        expect(read.ok()).toBe(true);
        const { emailedTo } = (await read.json()) as {
            emailedTo: string | null;
        };

        await page.goto(`/customers/${contactId}?tab=msg`);
        const reply = page.getByRole("textbox", { name: /^Reply to / });
        await expect(reply).toBeVisible();
        const note = page.locator(
            `#${await reply.getAttribute("aria-describedby")}`,
        );
        if (emailedTo) {
            // Their own address, the one they signed in with.
            expect(emailedTo.toLowerCase()).toBe(email.toLowerCase());
            await expect(note).toContainText(
                `Emailed to ${emailedTo} a minute after you send.`,
            );
            await expect(note).not.toContainText("Nothing is emailed");
        } else {
            await expect(note).toContainText("Nothing is emailed or texted.");
            await expect(note).not.toContainText("Emailed to");
        }

        // Nothing sideways at this width, with the address in the line.
        const width = page.viewportSize()?.width ?? 0;
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth),
            )
            .toBeLessThanOrEqual(width);

        // The reply still lands in their thread, and in their account.
        await reply.fill(answer);
        await page.getByRole("button", { name: "Send reply" }).click();
        await expect(
            page.getByRole("list", { name: /^Messages with / }),
        ).toContainText(answer, { timeout: 15_000 });
        await visitor.goto(`${site}/account/messages`);
        await expect(
            visitor.getByRole("list", { name: /^Messages with / }),
        ).toContainText(answer);
        await customer.close();
    });
});
