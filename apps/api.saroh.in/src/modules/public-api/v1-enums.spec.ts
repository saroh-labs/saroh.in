import {
    BOOKING_STATES,
    BOOKING_STATUSES,
    ENQUIRY_STATUSES,
    FULFILMENTS,
    HOLD_PAY,
    PAY_BY,
    PAYMENT_PROVIDERS,
    PLAN_INTERVALS,
    PLAN_STATUSES,
    BOOKING_OUTCOMES as PUBLIC_BOOKING_OUTCOMES,
    ORDER_STAGES as PUBLIC_ORDER_STAGES,
    ORDER_STATUSES as PUBLIC_ORDER_STATUSES,
    PAYMENT_STATUSES as PUBLIC_PAYMENT_STATUSES,
    POST_STATUSES as PUBLIC_POST_STATUSES,
    PRODUCT_STATUSES as PUBLIC_PRODUCT_STATUSES,
    SERVICE_STATUSES as PUBLIC_SERVICE_STATUSES,
    REFUND_STATUSES,
} from "@saroh/api-contract";
import { OrderFulfilment, OrderStage, PaymentProvider } from "@saroh/database";

import { BOOKING_OUTCOMES, SERVICE_STATUSES } from "../bookings/dto";
import { POST_STATUSES } from "../content/dto";
import { LEAD_STATUSES } from "../leads/dto";
import {
    FULFILMENT_TYPES,
    ORDER_STAGES,
    ORDER_STATUSES,
    PAYMENT_STATUSES,
} from "../orders/dto";
import { PRODUCT_STATUSES } from "../products/dto";
import { PLAN_LIST_STATUSES } from "../subscriptions/dto";
import { INTERVALS } from "../subscriptions/periods";
import type { PublicEnum } from "./v1-enums";
import * as E from "./v1-enums";

/**
 * Every internal value a public enum field can carry has a published value
 * (review #3): a value added inside Saroh fails here until its table maps
 * it, and every published value is one the contract lists.
 */

const sorted = (values: readonly string[]) => [...values].sort();

// [table, Saroh's own values (where Saroh keeps a list), the contract's]
const CASES: [
    PublicEnum<string, string>,
    readonly string[] | null,
    readonly string[],
][] = [
    [E.orderStatus, ORDER_STATUSES, PUBLIC_ORDER_STATUSES],
    [
        E.paymentStatus,
        [...PAYMENT_STATUSES, "PARTIALLY_REFUNDED"],
        PUBLIC_PAYMENT_STATUSES,
    ],
    [E.orderStage, ORDER_STAGES, PUBLIC_ORDER_STAGES],
    [E.orderFulfilment, FULFILMENT_TYPES, FULFILMENTS],
    // Text columns or union types with no list: the Record type checks them.
    [E.bookingStatus, null, BOOKING_STATUSES],
    [E.bookingOutcome, BOOKING_OUTCOMES, PUBLIC_BOOKING_OUTCOMES],
    [E.refundStatus, null, REFUND_STATUSES],
    [E.productStatus, PRODUCT_STATUSES, PUBLIC_PRODUCT_STATUSES],
    [E.serviceStatus, SERVICE_STATUSES, PUBLIC_SERVICE_STATUSES],
    [E.postStatus, POST_STATUSES, PUBLIC_POST_STATUSES],
    [E.planStatus, PLAN_LIST_STATUSES, PLAN_STATUSES],
    [E.planInterval, INTERVALS, PLAN_INTERVALS],
    [E.enquiryStatus, LEAD_STATUSES, ENQUIRY_STATUSES],
    [E.bookingState, null, BOOKING_STATES],
    [E.payBy, null, PAY_BY],
    [E.holdPay, null, HOLD_PAY],
    [E.paymentProvider, Object.values(PaymentProvider), PAYMENT_PROVIDERS],
];

describe("public enum tables (review #3)", () => {
    it("covers every table", () => {
        expect(CASES.map(([table]) => table.field).sort()).toEqual(
            E.PUBLIC_ENUMS.map((t) => t.field).sort(),
        );
    });

    it.each(CASES.map((c) => [c[0].field, ...c] as const))(
        "%s maps every internal value to a published one, one to one",
        (_field, table, internal, published) => {
            const keys = Object.keys(table.table);
            if (internal) expect(sorted(keys)).toEqual(sorted(internal));
            const values = Object.values(table.table);
            expect(sorted(values)).toEqual(sorted(published));
            expect(new Set(values).size).toBe(values.length);
            for (const value of values) {
                expect(table.out(table.in(value))).toBe(value);
                expect(value).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
            }
        },
    );

    it("matches the schema's own enums for an order's stage and fulfilment", () => {
        expect(sorted(Object.values(OrderStage))).toEqual(sorted(ORDER_STAGES));
        expect(sorted(Object.values(OrderFulfilment))).toEqual(
            sorted(FULFILMENT_TYPES),
        );
    });

    it("refuses to publish a value no table names", () => {
        expect(() => E.orderStatus.out("ON_HOLD")).toThrow(
            /order.status: no public value/,
        );
        expect(() => E.orderStatus.out("toString")).toThrow();
    });
});
