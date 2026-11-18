import { addressLine, eventFor, eventIdFor } from "./event-shape";

const booking = {
    id: "bk_1",
    startAt: new Date("2027-01-04T05:00:00Z"),
    endAt: new Date("2027-01-04T05:30:00Z"),
    timezone: "Asia/Kolkata",
    bookerName: "Asha",
    bookerEmail: "asha@example.com",
    serviceName: "Consultation",
    online: false,
};

describe("a booking's event", () => {
    it("has one id per booking and connection, in Google's alphabet", () => {
        const id = eventIdFor("bk_1", "conn_a");
        expect(id).toBe(eventIdFor("bk_1", "conn_a"));
        expect(id).not.toBe(eventIdFor("bk_1", "conn_b"));
        expect(id).not.toBe(eventIdFor("bk_2", "conn_a"));
        expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    });

    it("names the service and the customer, invites them and keeps Saroh's id", () => {
        const e = eventFor(booking, {
            connectionId: "conn_a",
            meet: false,
            address: "12 MG Road, Bengaluru",
        });
        expect(e).toMatchObject({
            title: "Consultation with Asha",
            location: "12 MG Road, Bengaluru",
            guest: { email: "asha@example.com", name: "Asha" },
            bookingId: "bk_1",
            timeZone: "Asia/Kolkata",
        });
        expect(e.meetRequestId).toBeUndefined();
    });

    it("has no guest when the customer left no email", () => {
        const e = eventFor(
            { ...booking, bookerEmail: null, bookerName: null },
            { connectionId: "conn_a", meet: false, address: null },
        );
        expect(e.guest).toBeUndefined();
        expect(e.title).toBe("Consultation");
        expect(e.location).toBeUndefined();
    });

    it("asks for a Meet with the event's own id when online with Meet", () => {
        const e = eventFor(
            { ...booking, online: true },
            { connectionId: "conn_a", meet: true, address: "anywhere" },
        );
        expect(e.location).toBe("Online");
        expect(e.meetRequestId).toBe(e.eventId);
    });

    it("writes an address on one line", () => {
        expect(
            addressLine({
                addressLine1: "12 MG Road",
                addressLine2: " ",
                city: "Bengaluru",
                postalCode: "560001",
            }),
        ).toBe("12 MG Road, Bengaluru, 560001");
        expect(addressLine(null)).toBeNull();
    });
});
