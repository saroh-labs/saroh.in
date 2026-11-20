// @covers app:/sites/[siteId]/write/[postId] api:content api:sites
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { northwind, stamp } from "../fixtures/own-data";
import { people, useSession } from "../fixtures/sessions";
import { ignoreHTTPSErrors, NORTHWIND_ORG, urls } from "../playwright.config";

/**
 * Post approval (O7, owner 20 Nov 2026; `blogdesk/WXWPublish`,
 * `WXWReview`, `blogphone/WXYApproval`). With "Publishing needs approval"
 * on, Maya (a Member on Northwind given `section:write` for this test)
 * writes a post: her Publish post is Send for approval, the API refuses her
 * a direct publish (409), and the post says whose approval it waits for.
 * The owner opens it, sees her request in the band, and approves it, which
 * puts it live.
 *
 * `@serial`: it turns on the business-wide approval switch, which every
 * spec that publishes Northwind's site reads. Everything it changes is put
 * back in `finally`: the switch off, Maya's extra permissions as they were,
 * the post deleted.
 */

interface SiteRow {
    id: string;
}

interface MemberRow {
    userId: string;
    email?: string;
    user?: { email?: string };
    extraActions?: string[];
}

async function setApproval(
    request: APIRequestContext,
    siteId: string,
    on: boolean,
) {
    await northwind(request).patch(`/sites/${siteId}/settings`, {
        publishNeedsApproval: on,
    });
}

test(
    "a teammate's post goes for approval, and the owner's Approve puts it live",
    { tag: "@serial" },
    async ({ page, browser }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith("phone"),
            "The sheet and the band are the same pieces on a phone; the desk walks them.",
        );

        // The owner's side, in a context of its own.
        const ownerContext = await browser.newContext({
            baseURL: urls.APP_URL,
            ignoreHTTPSErrors,
        });
        const ownerPage = await ownerContext.newPage();
        await useSession(ownerPage, "owner");
        const owner = northwind(ownerPage.request);
        const site = (await owner.get<SiteRow[]>("/sites")).at(0);
        test.skip(!site, "Northwind has no website.");
        if (!site) return;

        const members = await owner.get<MemberRow[]>("/members");
        const maya = members.find(
            (m) => (m.email ?? m.user?.email) === people.northwindMember.email,
        );
        expect(maya, "Maya is on Northwind").toBeTruthy();
        if (!maya) return;
        const extras = maya.extraActions ?? [];
        let postId: string | null = null;

        try {
            await setApproval(ownerPage.request, site.id, true);
            await owner.put(`/members/${maya.userId}/extra-actions`, {
                actions: [...new Set([...extras, "section:write"])],
            });

            // Maya writes a post.
            await useSession(page, "northwindMember");
            await page.goto(`/open/${NORTHWIND_ORG}`);
            const mine = northwind(page.request);
            const title = `For approval ${stamp(testInfo)}`;
            const made = await mine.post<{ id: string }>(
                `/sites/${site.id}/posts`,
                {
                    title,
                    excerpt: "What to expect at a trial.",
                    content: "<p>A trial is a rehearsal for the day.</p>",
                },
            );
            postId = made.id;

            await page.goto(`/sites/${site.id}/posts/${made.id}`);
            test.skip(
                !page.url().includes(`/write/${made.id}`),
                "NEXT_PUBLIC_WEBSITE_AREA is off: today's post editor",
            );

            // A direct publish is refused in the site's words.
            const refused = await page.request.post(
                `${urls.API_URL}/organizations/${NORTHWIND_ORG}/sites/${site.id}/posts/${made.id}/publish`,
                { headers: mine.headers, data: {} },
            );
            expect(refused.status()).toBe(409);
            expect(await refused.text()).toContain("APPROVAL_REQUIRED");

            // Publish post is Send for approval.
            await page
                .locator("[data-post-bar]")
                .getByRole("button", { name: "Publish post" })
                .click();
            const sheet = page.getByRole("dialog", {
                name: "Send for approval",
            });
            await expect(sheet).toContainText(
                "Posts on this site go live once a reviewer, an admin or the owner approves them.",
            );
            await expect(sheet).toContainText("As soon as it is approved");
            await expect(sheet).toContainText(
                "You can keep writing. Changes after you send go for approval too.",
            );
            await sheet
                .getByLabel(/Note for whoever approves/)
                .fill("Could it go out before Saturday?");
            await sheet
                .getByRole("button", { name: "Send for approval" })
                .click();
            await expect(sheet).toHaveCount(0, { timeout: 15_000 });

            const chip = page.locator("[data-status-chip]");
            await expect(chip).toHaveText(/^Waiting for .*approval$/, {
                timeout: 15_000,
            });
            await expect(
                page.locator('[data-approval-band="waiting"]'),
            ).toBeVisible();

            // The owner approves it from the band: it goes live.
            await ownerPage.goto(`/open/${NORTHWIND_ORG}`);
            await ownerPage.goto(`/sites/${site.id}/write/${made.id}`);
            const band = ownerPage.locator('[data-approval-band="approver"]');
            await expect(band).toContainText("asked you to approve this post");
            await expect(band).toContainText(
                "“Could it go out before Saturday?”",
            );
            await band.getByRole("button", { name: "Approve" }).click();
            await expect(ownerPage.locator("[data-status-chip]")).toHaveText(
                "Live",
                { timeout: 15_000 },
            );
        } finally {
            await setApproval(ownerPage.request, site.id, false);
            await owner.put(`/members/${maya.userId}/extra-actions`, {
                actions: extras,
            });
            if (postId) await owner.delete(`/sites/${site.id}/posts/${postId}`);
            await ownerContext.close();
        }
    },
);
