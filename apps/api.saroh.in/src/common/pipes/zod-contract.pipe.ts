import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { errorCode } from "@saroh/api-contract";
import { z } from "zod";

/**
 * A public route's refusal as an exception carries it: the contract's error
 * minus `requestId`, which AllExceptionsFilter adds from the correlation id.
 */
export const contractRefusal = z.object({
    error: z.object({ code: errorCode, message: z.string() }),
});

/** Names each failing field by where it came from: `body.items.0.qty: Too small`. */
function describe(error: z.ZodError, where: string): string {
    return (
        error.issues
            .map((issue) => {
                const path = [where, ...issue.path.map(String)];
                if (issue.code === "unrecognized_keys") {
                    return issue.keys
                        .map(
                            (key) =>
                                `${[...path, key].join(".")}: Unknown field`,
                        )
                        .join("; ");
                }
                return `${path.join(".")}: ${issue.message}`;
            })
            // Two checks on one field can say the same thing; say it once.
            .filter((message, i, all) => all.indexOf(message) === i)
            .join("; ")
    );
}

/**
 * Validates a public route's params, query or body against its contract
 * schema (plan 2026-11-10-001, U1): `@Body(new ZodContractPipe(schema))`.
 * Returns the parsed value, so defaults and the query's explicit conversions
 * apply; anything else is a 400 `invalid_request` naming the field.
 */
export class ZodContractPipe implements PipeTransform {
    constructor(private readonly schema: z.ZodType) {}

    transform(value: unknown, metadata: ArgumentMetadata): unknown {
        const result = this.schema.safeParse(value);
        if (result.success) return result.data;
        throw new BadRequestException({
            error: {
                code: "invalid_request",
                message: describe(result.error, metadata.type),
            },
        } satisfies z.infer<typeof contractRefusal>);
    }
}
