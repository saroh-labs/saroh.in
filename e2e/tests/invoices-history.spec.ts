// @covers accounts:/login app:/open app:/billing/invoices/[invoiceId] api:invoices
import { expect, test } from "@playwright/test";

import { makeContact, northwind, stamp } from "../fixtures/own-data";
import { useSession } from "../fixtures/sessions";
import { NORTHWIND_ORG } from "../playwright.config";

/**
 * An invoice's history says who did what (automatic notices U9 #1140): on
 * Northwind, an invoice this test makes is issued and given a new link by
 * the signed-in owner, and "What happened" names them on each line; the
 * history route answers the same events, newest first, with the person.
 * Desk and phone, by the projects.
 */

interface Entry {
    source: string;
    kind: string;
    actor: { kind: string; name: string | null };
}

test("What happened names who issued it and who made its link", async ({
    page,
}) => {
    await useSession(page);
    await page.goto(`/open/${NORTHWIND_ORG}`);
    const nw = northwind(page.request);
    const s = stamp(test.info());
    const contact = await makeContact(page.request, {
        firstName: "Asha",
        lastName: `History ${s}`,
        email: `inv-history-${s}@example.com`,
    });
    const made = await nw.post<{ id: string }>("/invoices", {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Shelving", quantity: 1, unitPrice: "8400" }],
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    await nw.post(`/invoices/${made.id}/issue`);
    await nw.post(`/invoices/${made.id}/view-link`);

    const history = await nw.get<Entry[]>(`/invoices/${made.id}/history`);
    expect(history.slice(0, 2).map((h) => `${h.source}:${h.kind}`)).toEqual([
        "EVENT:LINK_MADE",
        "EVENT:ISSUED",
    ]);
    const owner = history[0]?.actor.name;
    expect(history[0]?.actor.kind).toBe("USER");

    await page.goto(`/billing/invoices/${made.id}`);
    const lines = page.locator("[data-history-line]").filter({ visible: true });
    await expect(lines.filter({ hasText: /issued/ }).first()).toContainText(
        owner ? `issued by ${owner}` : "issued",
    );
    await expect(
        lines.filter({ hasText: "New link made" }).first(),
    ).toBeVisible();
});
