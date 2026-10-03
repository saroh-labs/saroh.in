import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

import type { DeskMethod } from "./desk-take";
import { DESK_METHODS } from "./desk-take";

/** The most a desk payment can be: a `Decimal(12, 2)`'s room, in paise. */
const MAX_CENTS = 999_999_999_999;

/**
 * "Take ₹X" at the desk (round-2 P2). `amountCents` is the amount the
 * button showed, so a booking whose amount changed since is refused, never
 * taken at a figure nobody saw; the API still works the amount out itself.
 */
export class TakeDeskPaymentDto {
    @IsIn(DESK_METHODS)
    method!: DeskMethod;

    @IsInt()
    @Min(1)
    @Max(MAX_CENTS)
    amountCents!: number;

    /** Cash given, in minor units, for the change. Only with CASH. */
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(MAX_CENTS)
    receivedCents?: number;
}
