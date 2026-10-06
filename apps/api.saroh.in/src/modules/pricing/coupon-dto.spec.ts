// A coupon's Razorpay offer id as the admin API accepts it, checked with the
// same validator the global ValidationPipe runs. Every id here is made up.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateCouponDto, RAZORPAY_OFFER_ID, UpdateCouponDto } from "./dto";

const base = {
    code: "FAKE-111",
    discountPaise: 111,
    months: 2,
    planIds: ["b"],
    maxRedemptions: 3,
    reason: "fake coupon",
    idempotencyKey: "fake-key-0001",
};

async function refusedOn(
    dto: typeof CreateCouponDto | typeof UpdateCouponDto,
    body: Record<string, unknown>,
): Promise<string[]> {
    return (await validate(plainToInstance(dto, body))).map((e) => e.property);
}

describe("a coupon's Razorpay offer id", () => {
    it("is offer_ and 14 letters or digits, 20 in all", () => {
        expect(RAZORPAY_OFFER_ID.test("offer_ABCDEFGHIJKLMN")).toBe(true);
        expect("offer_ABCDEFGHIJKLMN").toHaveLength(20);
        expect(RAZORPAY_OFFER_ID.test("offer_Ab12Cd34Ef56Gh")).toBe(true);
        for (const bad of [
            "offer_ABCDEFGHIJKLM",
            "offer_ABCDEFGHIJKLMNO",
            "plan_ABCDEFGHIJKLMNO",
            "offer_ABCDEFGHIJK-MN",
            "OFFER_ABCDEFGHIJKLMN",
        ]) {
            expect(RAZORPAY_OFFER_ID.test(bad)).toBe(false);
        }
    });

    it("is optional on create, taken trimmed, and refused in another shape", async () => {
        expect(await refusedOn(CreateCouponDto, base)).toEqual([]);
        expect(
            await refusedOn(CreateCouponDto, {
                ...base,
                razorpayOfferId: "  offer_ABCDEFGHIJKLMN ",
            }),
        ).toEqual([]);
        expect(
            plainToInstance(CreateCouponDto, {
                ...base,
                razorpayOfferId: "  offer_ABCDEFGHIJKLMN ",
            }).razorpayOfferId,
        ).toBe("offer_ABCDEFGHIJKLMN");
        expect(
            await refusedOn(CreateCouponDto, {
                ...base,
                razorpayOfferId: "offer_short",
            }),
        ).toEqual(["razorpayOfferId"]);
    });

    it("is cleared on update with null or an empty field", async () => {
        const update = {
            reason: "fake change",
            idempotencyKey: "fake-key-0002",
        };
        expect(
            await refusedOn(UpdateCouponDto, {
                ...update,
                razorpayOfferId: null,
            }),
        ).toEqual([]);
        expect(
            plainToInstance(UpdateCouponDto, {
                ...update,
                razorpayOfferId: "  ",
            }).razorpayOfferId,
        ).toBeNull();
        expect(
            await refusedOn(UpdateCouponDto, {
                ...update,
                razorpayOfferId: 12,
            }),
        ).toEqual(["razorpayOfferId"]);
    });
});
