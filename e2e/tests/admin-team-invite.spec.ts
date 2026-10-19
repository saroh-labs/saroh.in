// @covers accounts:/staff-invite api:admin api:staff-invites pkg:auth
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { APIRequestContext, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stamp } from "../fixtures/own-data";
import { people, useSession } from "../fixtures/sessions";
import { urls } from "../playwright.config";
import { readSiteCode } from "./site-codes";

/**
 * Adding a teammate with no Saroh account (admin console U24, R32): Sam
 * (`people.staff`, a Platform owner) invites a new address, and its holder
 * opens the link, makes an account with a code and joins the team on
 * accounts.saroh.in.
 *
 * Each test owns its data: a stamped example.com address of its own, its
 * own invite and the account it makes. No seeded person is invited, signed
 * in as the invitee or changed. The stack has no SMTP: the API's fake
 * transport leaves the invite's link and the sign-in code in the temp
 * directory (`apps/api.saroh.in/src/common/site-code-outbox.ts`), which
 * only works with the API on this machine. The rules behind each refusal
 * are `admin-staff-invite.db.spec.ts`'s.
 */

function inviteOutbox(email: string): string {
    return path.join(
        tmpdir(),
        "saroh-staff-invites",
        encodeURIComponent(email.trim().toLowerCase()),
    );
}

/** The link the API just emailed to `email`. */
async function readInviteLink(email: string): Promise<string> {
    let link: string | null = null;
    await expect
        .poll(
            () => {
                try {
                    link = readFileSync(inviteOutbox(email), "utf8").trim();
                } catch {
                    link = null;
                }
                return link;
            },
            { timeout: 15_000 },
        )
        .toMatch(/\/staff-invite\/open\?token=[A-Za-z0-9_-]{43}$/);
    return link as unknown as string;
}

/** Sam invites `email` from the console's API. */
async function invite(
    request: APIRequestContext,
    email: string,
    testInfo: TestInfo,
) {
    return request.post(`${urls.API_URL}/admin/staff/invites`, {
        headers: { origin: urls.APP_URL },
        data: {
            email,
            name: "Asha Rao",
            worksAs: "ACCOUNT_MANAGER_JOB",
            roles: ["ACCOUNT_MANAGER"],
            onCommission: true,
            reason: "Joins the sales team (browser test)",
            idempotencyKey: `invite-${stamp(testInfo)}`,
        },
    });
}

async function newInvitee(page: Page, testInfo: TestInfo) {
    const email = `asha.${stamp(testInfo)}@example.com`.toLowerCase();
    await useSession(page, "staff");
    const res = await invite(page.request, email, testInfo);
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ emailed: true });
    return { email, link: await readInviteLink(email) };
}

test.describe("adding a teammate by invite (U24)", () => {
    test("the invitee makes an account with a code and joins, and the address ends clean", async ({
        page,
        browser,
    }, testInfo) => {
        const { email, link } = await newInvitee(page, testInfo);

        // The invitee, in a browser of their own with nobody signed in.
        const theirs = await browser.newContext();
        const invitee = await theirs.newPage();
        try {
            await invitee.goto(link);
            // The token was swapped for a cookie: the address is clean.
            await expect(invitee).toHaveURL(
                `${urls.ACCOUNTS_URL}/staff-invite`,
            );
            expect(invitee.url()).not.toContain("token");
            await expect(
                invitee.getByRole("heading", {
                    level: 1,
                    name: "Join Saroh's team",
                }),
            ).toBeVisible();
            await expect(invitee.getByText(email).first()).toBeVisible();
            await expect(
                invitee.getByText(/On the console you'll be Account manager/),
            ).toBeVisible();
            // The cookie is scoped to the invite page's path on purpose.
            const cookies = await theirs.cookies(
                `${urls.ACCOUNTS_URL}/staff-invite`,
            );
            expect(
                cookies.find((c) => c.name === "saroh_staff_invite"),
            ).toMatchObject({ httpOnly: true });

            await invitee
                .getByRole("link", { name: "Create one with this email" })
                .click();
            await expect(invitee.getByLabel("Email")).toHaveValue(email);
            await invitee
                .getByRole("button", { name: "Email me a code" })
                .click();
            const code = await readSiteCode(email);
            await invitee.getByLabel("Code").fill(code);

            // Back on the invite, signed in as its address.
            await invitee.waitForURL(
                (url) => url.pathname === "/staff-invite",
                { timeout: 20_000 },
            );
            expect(invitee.url()).not.toContain("token");
            await invitee
                .getByRole("button", { name: "Join the team" })
                .click();
            await expect(
                invitee.getByRole("heading", { name: "You're on the team" }),
            ).toBeVisible();
            await expect(
                invitee.getByRole("link", { name: "Open the console" }),
            ).toBeVisible();
        } finally {
            await theirs.close();
        }

        // On the team, as an Account manager, with their profile.
        const team = await page.request.get(`${urls.API_URL}/admin/staff`);
        const member = (
            (await team.json()) as {
                email: string;
                platformAdminId: string;
                roles: { role: string }[];
            }[]
        ).find((m) => m.email === email);
        expect(member?.roles.map((r) => r.role)).toEqual(["ACCOUNT_MANAGER"]);
        const profile = await page.request.get(
            `${urls.API_URL}/admin/staff/${member?.platformAdminId}/profile`,
        );
        expect(await profile.json()).toMatchObject({
            exists: true,
            worksAs: "ACCOUNT_MANAGER_JOB",
            workEmail: null,
            onCommission: true,
        });
    });

    test("a withdrawn invite's link says it can no longer be used", async ({
        page,
        browser,
    }, testInfo) => {
        const { email, link } = await newInvitee(page, testInfo);
        const listed = await page.request.get(
            `${urls.API_URL}/admin/staff/invites`,
        );
        const row = (
            (await listed.json()) as { id: string; email: string }[]
        ).find((i) => i.email === email);
        const withdrawn = await page.request.delete(
            `${urls.API_URL}/admin/staff/invites/${row?.id}`,
            {
                headers: { origin: urls.APP_URL },
                data: {
                    reason: "Hired someone else (browser test)",
                    idempotencyKey: `withdraw-${stamp(testInfo)}`,
                },
            },
        );
        expect(withdrawn.ok()).toBe(true);

        const theirs = await browser.newContext();
        const invitee = await theirs.newPage();
        try {
            await invitee.goto(link);
            await expect(invitee).toHaveURL(
                `${urls.ACCOUNTS_URL}/staff-invite`,
            );
            await expect(
                invitee.getByRole("heading", {
                    level: 1,
                    name: "This invite can no longer be used",
                }),
            ).toBeVisible();
        } finally {
            await theirs.close();
        }
    });

    test("with no link opened, the page asks for the email's link again", async ({
        browser,
    }) => {
        const theirs = await browser.newContext();
        const visitor = await theirs.newPage();
        try {
            await visitor.goto(`${urls.ACCOUNTS_URL}/staff-invite`);
            await expect(
                visitor.getByRole("heading", {
                    level: 1,
                    name: "Open the link from your email again",
                }),
            ).toBeVisible();
        } finally {
            await theirs.close();
        }
    });

    test("someone already on the team is not invited again", async ({
        page,
    }, testInfo) => {
        await useSession(page, "staff");
        const res = await invite(page.request, people.staff.email, testInfo);
        expect(res.status()).toBe(409);
        expect(await res.json()).toMatchObject({
            error: { details: { code: "ALREADY_ON_TEAM" } },
        });
    });
});
