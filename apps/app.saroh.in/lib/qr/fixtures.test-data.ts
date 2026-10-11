import type { QrCodeView } from "./types";

/** A made-up saved code for tests: the booking page, at the counter. */
export function code(over: Partial<QrCodeView> = {}): QrCodeView {
    const short = over.code ?? "h7c";
    return {
        id: `qr_${short}`,
        code: short,
        link: `https://glow.saroh.app/q/${short}`,
        target: {
            kind: "BOOK",
            ref: null,
            name: "Booking page",
            path: "/book",
            missing: false,
        },
        place: "COUNTER",
        placeNote: null,
        label: "Scan to book",
        style: "PLAIN",
        color: "#1c1c1a",
        retired: false,
        retiredAt: null,
        createdAt: "2026-10-10T09:00:00.000Z",
        updatedAt: "2026-10-10T09:00:00.000Z",
        scans: { total: 0, last7Days: 0 },
        bookings: 0,
        orders: 0,
        ...over,
    };
}
