import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { validationPipeOptions } from "../../common/validation";
import { CreateOrderDto, EditOrderDto } from "./dto";

/**
 * How an order leaves, as a create or an edit sends it (DEC-045). The
 * legacy words COLLECT and DELIVERY went in the contract release (B2d): no
 * app from before B2a is in production, and the column no longer holds
 * them, so a client sending one is told so rather than stored.
 */
describe("the order DTOs' fulfilment (B2d)", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const parse = (
        metatype: typeof CreateOrderDto | typeof EditOrderDto,
        value: Record<string, unknown>,
    ) => pipe.transform(value, { type: "body", metatype });

    const create = {
        customerId: "c1",
        items: [{ productId: "p1", quantity: 1 }],
    };

    it.each(["PICKUP", "LOCAL_DELIVERY", "SHIPPING", "DIGITAL"])(
        "takes %s",
        async (fulfilment) => {
            await expect(
                parse(CreateOrderDto, { ...create, fulfilment }),
            ).resolves.toMatchObject({ fulfilment });
            await expect(
                parse(EditOrderDto, { fulfilment }),
            ).resolves.toMatchObject({ fulfilment });
        },
    );

    it.each(["COLLECT", "DELIVERY"])(
        "refuses the legacy word %s with 400",
        async (fulfilment) => {
            await expect(
                parse(CreateOrderDto, { ...create, fulfilment }),
            ).rejects.toThrow(BadRequestException);
            await expect(parse(EditOrderDto, { fulfilment })).rejects.toThrow(
                BadRequestException,
            );
        },
    );
});

/** New order v2's who and how it is paid (B13), as the pipe reads them. */
describe("the create DTO's walk-in and payment (B13)", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const parse = (value: Record<string, unknown>) =>
        pipe.transform(value, { type: "body", metatype: CreateOrderDto });
    const items = [{ productId: "p1", quantity: 1 }];

    it("takes a walk-in with a name, and a phone if given", async () => {
        await expect(
            parse({
                items,
                walkIn: { name: " Asha ", phone: "+91 98450 00002" },
                payment: { kind: "CASH", received: "500" },
            }),
        ).resolves.toMatchObject({
            walkIn: { name: "Asha", phone: "+91 98450 00002" },
            payment: { kind: "CASH", received: "500" },
        });
        await expect(
            parse({ items, walkIn: { name: "Ravi", phone: "" } }),
        ).resolves.toMatchObject({ walkIn: { name: "Ravi", phone: null } });
    });

    it("refuses a walk-in with no name with 400", async () => {
        await expect(parse({ items, walkIn: { name: "  " } })).rejects.toThrow(
            BadRequestException,
        );
    });

    it("refuses a phone that isn't one, and an email that isn't one", async () => {
        await expect(
            parse({ items, walkIn: { name: "Asha", phone: "call me" } }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            parse({ items, customer: { email: "not-an-email" } }),
        ).rejects.toThrow(BadRequestException);
    });

    it("lower-cases a new customer's email", async () => {
        await expect(
            parse({ items, customer: { email: " Nisha@Example.IN " } }),
        ).resolves.toMatchObject({ customer: { email: "nisha@example.in" } });
    });

    it.each(["CASH", "UPI", "CARD", "LATER", "LINK"])(
        "takes %s as how it is paid",
        async (kind) => {
            await expect(
                parse({ items, walkIn: { name: "A" }, payment: { kind } }),
            ).resolves.toMatchObject({ payment: { kind } });
        },
    );

    it("refuses a payment kind it doesn't know, and cash that isn't an amount", async () => {
        await expect(
            parse({
                items,
                walkIn: { name: "A" },
                payment: { kind: "CHEQUE" },
            }),
        ).rejects.toThrow(BadRequestException);
        await expect(
            parse({
                items,
                walkIn: { name: "A" },
                payment: { kind: "CASH", received: "five hundred" },
            }),
        ).rejects.toThrow(BadRequestException);
    });
});
