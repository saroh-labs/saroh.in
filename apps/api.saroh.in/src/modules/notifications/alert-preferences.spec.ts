// F14's rules, pure: the rows, the defaults, what each channel can do, and
// which inbox notices a person doesn't see.

import type { OrgAction } from "../organizations/organization-actions";
import {
    ALERT_EVENTS,
    alertEventOfType,
    alertOn,
    channelState,
    defaultOn,
    hiddenNotificationTypes,
    mayHearAbout,
} from "./alert-preferences";

const holds =
    (...actions: OrgAction[]) =>
    (a: OrgAction) =>
        actions.includes(a);

describe("alerts", () => {
    it("offers the design's four rows, and no Monday summary (default 127)", () => {
        expect(ALERT_EVENTS).toEqual(["order", "booking", "failed", "team"]);
    });

    it("starts with the bell on for everything, email for a failed payment, and WhatsApp off (default 126)", () => {
        for (const event of ALERT_EVENTS) {
            expect(defaultOn(event, "bell")).toBe(true);
            expect(defaultOn(event, "email")).toBe(event === "failed");
            expect(defaultOn(event, "whatsapp")).toBe(false);
        }
    });

    it("reads a person's own row over the default", () => {
        const stored = [{ event: "order", channel: "email", enabled: true }];
        expect(alertOn(stored, "order", "email")).toBe(true);
        expect(alertOn(stored, "order", "bell")).toBe(true);
        expect(alertOn([], "order", "email")).toBe(false);
        expect(
            alertOn(
                [{ event: "failed", channel: "email", enabled: false }],
                "failed",
                "email",
            ),
        ).toBe(false);
    });

    it("offers a row only to a role that reads what it is about", () => {
        // The kitchen: orders by their stage, and the diary.
        const kitchen = holds("order:stage", "booking:read", "member:read");
        expect(mayHearAbout("order", kitchen)).toBe(true);
        expect(mayHearAbout("booking", kitchen)).toBe(true);
        expect(mayHearAbout("failed", kitchen)).toBe(false);
        expect(mayHearAbout("team", kitchen)).toBe(true);
        // A failed payment is money, read as payments or as invoices.
        expect(mayHearAbout("failed", holds("invoice:read"))).toBe(true);
        expect(mayHearAbout("failed", holds("payment:read"))).toBe(true);
    });

    describe("channels", () => {
        const base = {
            seesInbox: true,
            emailConnected: true,
            whatsappConnected: true,
        };

        it("the bell, only to someone who sees the inbox", () => {
            expect(channelState({ ...base, channel: "bell" })).toEqual({
                available: true,
            });
            expect(
                channelState({ ...base, seesInbox: false, channel: "bell" }),
            ).toEqual({ available: false, reason: "NO_INBOX" });
        });

        it("email, only through the business's own connected provider", () => {
            expect(channelState({ ...base, channel: "email" })).toEqual({
                available: true,
            });
            expect(
                channelState({
                    ...base,
                    emailConnected: false,
                    channel: "email",
                }),
            ).toEqual({ available: false, reason: "NO_PROVIDER" });
        });

        it("WhatsApp never: with a provider, there is still no number for a team member", () => {
            expect(channelState({ ...base, channel: "whatsapp" })).toEqual({
                available: false,
                reason: "NO_NUMBER",
            });
            expect(
                channelState({
                    ...base,
                    whatsappConnected: false,
                    channel: "whatsapp",
                }),
            ).toEqual({ available: false, reason: "NO_PROVIDER" });
        });
    });

    describe("the inbox", () => {
        it("knows which row a notice belongs to", () => {
            expect(alertEventOfType("order.new")).toBe("order");
            expect(alertEventOfType("booking.moved")).toBe("booking");
            expect(alertEventOfType("booking.cancelled")).toBe("booking");
            expect(alertEventOfType("payment.failed")).toBe("failed");
            expect(alertEventOfType("team.joined")).toBe("team");
            expect(alertEventOfType("enquiry.new")).toBeNull();
        });

        it("hides nothing from someone who reads everything and changed nothing", () => {
            const owner = () => true;
            expect(hiddenNotificationTypes([], owner)).toEqual([]);
        });

        it("hides a row's notices once its bell is off", () => {
            expect(
                hiddenNotificationTypes(
                    [{ event: "booking", channel: "bell", enabled: false }],
                    () => true,
                ),
            ).toEqual(["booking.new", "booking.moved", "booking.cancelled"]);
        });

        it("an email choice never hides anything from the bell", () => {
            expect(
                hiddenNotificationTypes(
                    [{ event: "order", channel: "email", enabled: false }],
                    () => true,
                ),
            ).toEqual([]);
        });
    });
});
