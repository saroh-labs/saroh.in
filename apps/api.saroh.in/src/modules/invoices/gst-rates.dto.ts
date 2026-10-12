import { Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsString,
    MaxLength,
    MinLength,
    ValidateNested,
} from "class-validator";

/**
 * What carries a saved GST rate: a service, a product, a membership plan,
 * a class pack or a course.
 */
export const RATED_KINDS = [
    "SERVICE",
    "PRODUCT",
    "PLAN",
    "PACK",
    "COURSE",
] as const;
export type RatedKind = (typeof RATED_KINDS)[number];

/** The most rates one save sets: a sheet's worth. */
export const MAX_RATES_PER_SAVE = 200;

export class SetGstRateDto {
    @IsIn(RATED_KINDS)
    kind!: RatedKind;

    @IsString()
    @MinLength(1)
    @MaxLength(64)
    id!: string;

    /**
     * GST in percent, as the editors send it: "0" is exempt or nil-rated,
     * a choice of its own. Checked against GST's rates by the service.
     */
    @IsString()
    @MinLength(1, { message: "Choose a GST rate" })
    @MaxLength(5)
    rate!: string;
}

export class SetGstRatesDto {
    @IsArray()
    @ArrayMinSize(1, { message: "Choose a GST rate" })
    @ArrayMaxSize(MAX_RATES_PER_SAVE)
    @ValidateNested({ each: true })
    @Type(() => SetGstRateDto)
    items!: SetGstRateDto[];
}
