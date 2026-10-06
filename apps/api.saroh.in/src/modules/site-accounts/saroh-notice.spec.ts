import type { NoticeVars } from "./notify-templates";
import { renderNotice } from "./notify-templates";
import { renderSarohNotice } from "./saroh-notice";

const booking = (
    over: Partial<{
        business: string;
        service: string;
        staff: string | null;
        firstName: string | null;
    }> = {},
): NoticeVars => ({
    kind: "BOOKING_CONFIRMED",
    booking: {
        business: "Rye & Co.",
        firstName: "Asha",
        service: "Check-up",
        staff: "Meera",
        startAt: new Date("2026-10-06T05:30:00Z"),
        fromStartAt: null,
        timeZone: "Asia/Kolkata",
        byCustomer: false,
        ...over,
    },
});

const sender = {
    fallbackName: "rye-co",
    contactEmail: "hello@rye.example",
    phone: null,
};

describe("a booking notice as Saroh sends it (DEC-086)", () => {
    it("says what the business's own provider would, with Saroh's footer", () => {
        const words = renderSarohNotice(booking(), sender);
        const own = renderNotice(booking());
        expect(words?.subject).toBe(own.subject);
        expect(words?.body.startsWith(own.body)).toBe(true);
        expect(words?.body).toContain(
            "<p>Sent for Rye &amp; Co. by Saroh. Reply to this email to reach Rye &amp; Co.</p>",
        );
    });

    it("cleans links and domains out of the business, service and staff names, subject and body alike", () => {
        const words = renderSarohNotice(
            booking({
                business: "Bank Alert www.evil.example",
                service: "Free gift https://evil.example/claim",
                staff: "mail me@evil.example",
            }),
            sender,
        );
        expect(words?.subject).toBe(
            "Your booking with Bank Alert is confirmed",
        );
        const all = `${words?.subject} ${words?.body}`;
        expect(all).not.toMatch(/evil|https?:|www\./);
        expect(words?.body).toContain("Your Free gift with mail on");
    });

    it("cleans the customer's first name too, and greets with Hello when nothing is left", () => {
        const linked = renderSarohNotice(
            booking({ firstName: "Asha www.evil.example" }),
            sender,
        );
        expect(linked?.body).toContain("Hi Asha,");
        expect(linked?.body).not.toMatch(/evil|www\./);

        const onlyALink = renderSarohNotice(
            booking({ firstName: "https://evil.example/claim" }),
            sender,
        );
        expect(onlyALink?.body).toContain("Hello,");
        expect(onlyALink?.body).not.toMatch(/evil|https?:/);
    });

    it("falls back when nothing of a name survives cleaning", () => {
        const words = renderSarohNotice(
            booking({
                business: "www.evil.example",
                service: "https://evil.example",
                staff: "evil.example",
            }),
            sender,
        );
        expect(words?.subject).toBe("Your booking with rye-co is confirmed");
        expect(words?.body).toContain("Your booking on ");
        expect(words?.body).not.toContain(" with ");
    });

    it("without a reply address, says how to reach the business, with its phone when it has one", () => {
        const noReply = renderSarohNotice(booking(), {
            ...sender,
            contactEmail: "not an address",
        });
        expect(noReply?.body).toContain(
            "To reach Rye &amp; Co., message them from your account on their site.",
        );
        const phone = renderSarohNotice(booking(), {
            ...sender,
            contactEmail: null,
            phone: "+919845012345",
        });
        expect(phone?.body).toContain(
            "message them from your account on their site or call +919845012345.",
        );
    });

    it("words only booking notices", () => {
        expect(
            renderSarohNotice(
                {
                    kind: "WAITLIST_OFFER",
                    waitlist: {
                        business: "Rye",
                        firstName: null,
                        service: "Yoga",
                        startAt: new Date(),
                        heldUntil: new Date(),
                        timeZone: "Asia/Kolkata",
                    },
                },
                sender,
            ),
        ).toBeNull();
    });
});
