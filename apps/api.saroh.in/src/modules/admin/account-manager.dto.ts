import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from "class-validator";

import { OperatorReasonDto } from "./dto";

/** Most businesses one Share out evenly takes, so it stays one short write. */
export const SHARE_OUT_MAX = 500;

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

/** Give a business a manager, or move it to another (U25). */
export class AssignManagerDto extends OperatorReasonDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Pick an account manager" })
    @MaxLength(64)
    platformAdminId!: string;
}

/**
 * Share out evenly. With `organizationIds`, only those (the ones the Team
 * list shows); without, every business without a manager.
 */
export class ShareOutDto extends OperatorReasonDto {
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(SHARE_OUT_MAX)
    @IsString({ each: true })
    @MaxLength(64, { each: true })
    organizationIds?: string[];
}
