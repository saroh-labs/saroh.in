import type { WebhookEndpointView } from "@saroh/api-contract";
import { describe, expect, it } from "vitest";

import { lastSentLine } from "./webhooks";

const now = new Date("2026-11-12T10:00:00Z");
const sent = (status: "PENDING" | "DELIVERED" | "FAILED") =>
    ({
        lastSent: { at: "2026-11-12T10:00:00Z", status },
    }) as unknown as WebhookEndpointView;

describe("an address's last send", () => {
    it("says sent only when it got through", () => {
        expect(lastSentLine(sent("DELIVERED"), now, "UTC")).toMatch(
            /^Last sent /,
        );
        expect(lastSentLine(sent("PENDING"), now, "UTC")).toMatch(
            /^Trying again, last try /,
        );
        expect(lastSentLine(sent("FAILED"), now, "UTC")).toMatch(
            /^Last try failed /,
        );
    });

    it("says nothing before the first send", () => {
        expect(
            lastSentLine(
                { lastSent: null } as unknown as WebhookEndpointView,
                now,
                "UTC",
            ),
        ).toBeNull();
    });
});
