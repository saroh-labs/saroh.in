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
    it("offers the design's four rows, the Website row (DEC-071) and data removal requests (DEC-172), and no Monday summary (default 127)", () => {
        expect(ALERT_EVENTS).toEqual([
            "order",
            "booking",
            "failed",
            "team",
            "site",
            "request",
        ]);
    });

    it("starts with the bell on for everything, email for a failed payment, a scheduled go-live and a data removal request, and WhatsApp off (default 126)", () => {
        for (const event of ALERT_EVENTS) {
            expect(defaultOn(event, "bell")).toBe(true);
            expect(defaultOn(event, "email")).toBe(
                event === "failed" || event === "site" || event === "request",
            );
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
        // A go-live is heard of by whoever could have put the site live.
        expect(mayHearAbout("site", holds("site:publish"))).toBe(true);
        expect(mayHearAbout("site", holds("site:read", "site:approve"))).toBe(
            false,
        );
        expect(alertEventOfType("site.live")).toBe("site");
        expect(alertEventOfType("site.not_live")).toBe("site");
        // A data removal request: whoever can run a customer removal
        // (DEC-172), not whoever only reads or edits customers.
        expect(mayHearAbout("request", holds("customer:remove"))).toBe(true);
        expect(
            mayHearAbout("request", holds("contact:read", "contact:write")),
        ).toBe(false);
        expect(alertEventOfType("customer.data-request")).toBe("request");
    });

    it("never offers Calendar only the business's booking alerts (#868)", () => {
        const diary = holds("booking:read", "booking:write");
        // A booking alert names whoever booked with anyone.
        expect(mayHearAbout("booking", diary, "calendar-only")).toBe(false);
        expect(mayHearAbout("booking", diary, "front-desk")).toBe(true);
    });

    describe("channels", () => {
        const base = {
            seesInbox: true,
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

        it("email, always: Saroh sends it, provider or not (DEC-011, 7 Oct)", () => {
            expect(channelState({ ...base, channel: "email" })).toEqual({
                available: true,
            });
            expect(
                channelState({
                    ...base,
                    whatsappConnected: false,
                    channel: "email",
                }),
            ).toEqual({ available: true });
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
