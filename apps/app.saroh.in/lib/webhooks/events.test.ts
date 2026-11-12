import type { WebhookEndpointView } from "@saroh/api-contract";
import { describe, expect, it } from "vitest";

import { addressLine, endpointState, eventLabel, eventsFor } from "./events";

const endpoint = (over: Partial<WebhookEndpointView>): WebhookEndpointView => ({
    id: "e1",
    name: null,
    url: "https://hooks.example.com/saroh",
    events: ["order.paid"],
    enabled: true,
    disabledAt: null,
    failureStreak: 0,
    createdByUserId: "u1",
    previousSecretUntil: null,
    lastSent: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...over,
});

describe("webhook events", () => {
    it("offers only the events the person may read", () => {
        const may = (a: string) => a === "order:read";
        expect(eventsFor(may)).toEqual([
            "order.created",
            "order.paid",
            "order.status_changed",
        ]);
    });

    it("names a test message", () => {
        expect(eventLabel("order.paid")).toBe("Order paid");
        expect(eventLabel("ping")).toBe("Test message");
    });

    it("tells Saroh's turning off from a person's", () => {
        expect(endpointState(endpoint({}))).toBe("working");
        expect(
            endpointState(
                endpoint({
                    enabled: false,
                    disabledAt: "2026-11-08T00:00:00.000Z",
                    failureStreak: 20,
                }),
            ),
        ).toBe("turned-off");
        expect(
            endpointState(
                endpoint({
                    enabled: false,
                    disabledAt: "2026-11-08T00:00:00.000Z",
                }),
            ),
        ).toBe("off");
        // Switched off by hand after a couple of failures: just off.
        expect(
            endpointState(
                endpoint({
                    enabled: false,
                    disabledAt: "2026-11-08T00:00:00.000Z",
                    failureStreak: 2,
                }),
            ),
        ).toBe("off");
    });

    it("shows an address without its scheme", () => {
        expect(addressLine("https://n8n.example.com/webhook/rye/")).toBe(
            "n8n.example.com/webhook/rye",
        );
    });
});
