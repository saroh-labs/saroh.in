import { Transform } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsISO8601,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

import { MAX_BASIS_POINTS, RATE_KINDS } from "../commission/commission-rules";
import { OperatorReasonDto } from "./dto";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** "2026-12": a statement month. */
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?month=` on the payouts reads; this month in India when left out. */
export class CommissionMonthQueryDto {
    @IsOptional()
    @Matches(MONTH, { message: "A month is written 2026-12" })
    month?: string;
}

/** Mark a teammate's month paid, with the bank's reference (U21). */
export class MarkPayoutPaidDto extends OperatorReasonDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Pick who was paid" })
    @MaxLength(64)
    platformAdminId!: string;

    @Matches(MONTH, { message: "A month is written 2026-12" })
    month!: string;

    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give the payment's reference" })
    @MaxLength(120)
    reference!: string;
}

/** Set the rate for one kind of link from a date on (U21). */
export class SetCommissionRateDto extends OperatorReasonDto {
    @IsIn(RATE_KINDS)
    kind!: (typeof RATE_KINDS)[number];

    /** Hundredths of a percent. */
    @IsInt({ message: "A rate is a whole number of basis points" })
    @Min(0)
    @Max(MAX_BASIS_POINTS)
    basisPoints!: number;

    /** From when; now when left out. Never in the past. */
    @IsOptional()
    @IsISO8601({ strict: true })
    effectiveFrom?: string;
}
