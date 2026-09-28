import { Transform } from "class-transformer";
import {
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    MinLength,
} from "class-validator";

import type { MergeSide } from "./merge-plan";

const SIDES: readonly MergeSide[] = ["survivor", "other"];

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** `?survivorId=`: which of the two is kept; the older one when left out. */
export class MergePreviewQueryDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1)
    survivorId?: string;
}

/**
 * Merge two customers (DEC-042, C9). `name`, `email` and `phone` pick whose
 * value the survivor keeps (the survivor's own when left out). The account
 * choice and its confirmation follow ADR-011: when a site account will see
 * the combined record, `accountConfirmed` must be true.
 */
export class MergeContactsDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Choose which customer to keep" })
    survivorId!: string;

    @IsOptional()
    @IsIn(SIDES)
    name?: MergeSide;

    @IsOptional()
    @IsIn(SIDES)
    email?: MergeSide;

    @IsOptional()
    @IsIn(SIDES)
    phone?: MergeSide;

    /** Carry the other's sign-in over when the survivor has none (default). */
    @IsOptional()
    @IsBoolean()
    carryAccount?: boolean;

    /** "I've checked this email is theirs." */
    @IsOptional()
    @IsBoolean()
    accountConfirmed?: boolean;
}
