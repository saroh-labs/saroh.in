import type { SavedAddressRow } from "./checkout-saved-address";
import { savedAddressOf } from "./checkout-saved-address";

const row = (over: Partial<SavedAddressRow> = {}): SavedAddressRow => ({
    deliveryName: "Kavya Iyer",
    deliveryPhone: "98450 12345",
    deliveryLine1: "14, 2nd Cross",
    deliveryLine2: null,
    deliveryCity: "Bengaluru",
    deliveryState: "Karnataka",
    deliveryPostalCode: "560038",
    ...over,
});

describe("the last delivery's address, as the bag offers it", () => {
    it("is the order's own lines, tidied", () => {
        expect(
            savedAddressOf(
                row({ deliveryLine1: " 14, 2nd Cross ", deliveryLine2: "  " }),
            ),
        ).toEqual({
            name: "Kavya Iyer",
            phone: "98450 12345",
            line1: "14, 2nd Cross",
            line2: null,
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560038",
        });
    });

    it("keeps an address with no name or phone: the bag asks for what is missing", () => {
        expect(
            savedAddressOf(row({ deliveryName: null, deliveryPhone: "" })),
        ).toMatchObject({ name: null, phone: null, line1: "14, 2nd Cross" });
    });

    it("is nothing when there is no order, or any line a delivery needs is gone", () => {
        expect(savedAddressOf(null)).toBeNull();
        expect(savedAddressOf(undefined)).toBeNull();
        for (const gone of [
            "deliveryLine1",
            "deliveryCity",
            "deliveryState",
            "deliveryPostalCode",
        ] as const) {
            expect(savedAddressOf(row({ [gone]: null }))).toBeNull();
            expect(savedAddressOf(row({ [gone]: " " }))).toBeNull();
        }
    });
});
