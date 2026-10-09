// @covers accounts:/login app:/open app:/choose api:organizations
import { expect, test } from "@playwright/test";

import { useSession } from "../fixtures/sessions";

/**
 * A team member past the plan's limit after a move to a lower plan (#800):
 * the workspace says their access is paused, in plain words, rather than
 * opening into a page of denials.
 *
 * A real pause needs plan enforcement on, a business over its team limit
 * and a notice told at least 7 days ago, which no seeded business has and
 * nothing a browser can do sets up (the 7 days can't be waited). That is
 * proved against a real database by
 * `organization-context.paused.db.spec.ts`. What runs here is the door's
 * words: `/open` and the chooser send a paused business to
 * `/choose?notice=paused`, and the chooser says why there.
 *
 * Read-only; touches no business.
 */
test("a business whose door is paused says why on the chooser (#800)", async ({
    page,
}) => {
    await useSession(page);
    await page.goto("/choose?notice=paused");
    await expect(page).toHaveURL(/\/choose\?notice=paused$/);
    const line = page.getByRole("status");
    await expect(line).toContainText(
        "That business didn't open: your access is paused because its plan has no room for you right now.",
    );
    await expect(line).toContainText("Nothing of yours is lost.");
});
