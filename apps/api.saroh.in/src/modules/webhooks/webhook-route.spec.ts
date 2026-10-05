/**
 * The payment webhook route is the one `@saroh/integrations` names, which
 * `payments/webhook-setup.ts` builds each business's address from and the
 * marketing site's integration pages are checked against (Resources plan
 * U3). The controller writes it out as a string for the test-host route
 * list, so this pins the two together.
 */
import { PATH_METADATA } from "@nestjs/common/constants";
import { WEBHOOK_ROUTE, webhookPath } from "@saroh/integrations";

import { WebhooksController } from "./webhooks.controller";

describe("the payment webhook route", () => {
    it("is mounted where @saroh/integrations says", () => {
        expect(Reflect.getMetadata(PATH_METADATA, WebhooksController)).toBe(
            WEBHOOK_ROUTE,
        );
    });

    it("puts the provider and the business after it", () => {
        expect(webhookPath("RAZORPAY", "org_1")).toBe(
            `/${WEBHOOK_ROUTE}/razorpay/org_1`,
        );
    });
});
