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
