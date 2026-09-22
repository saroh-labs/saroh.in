import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

export const PACK_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

/**
 * A class pack, created or changed. A change reaches only packs sold after
 * it: every purchase keeps the classes, price and validity it was sold with.
 */
export class PackInputDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Give the pack a name" })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(500)
    description?: string | null;

    @IsOptional()
    @IsInt()
    @Min(1, { message: "A pack has at least one class" })
    @Max(500)
    credits?: number;

    @IsOptional()
    @IsInt()
    @Min(1, { message: "A pack is valid for at least a day" })
    @Max(3650)
    validityDays?: number;

    @IsOptional()
    @Transform(trim)
    @Matches(MONEY, { message: "A price has at most two decimal places" })
    price?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim().toUpperCase() : value,
    )
    @Matches(/^[A-Z]{3}$/, { message: "Currency must be a 3-letter code" })
    currency?: string;

    /** The services it pays for. Written as a whole. */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    serviceIds?: string[];
}

export class ListPacksQueryDto {
    @IsOptional()
    @IsIn(PACK_STATUSES)
    status?: PackStatus;
}

export class SellPackDto {
    @IsString()
    contactId!: string;
}

export class ListPurchasesQueryDto {
    @IsOptional()
    @IsString()
    contactId?: string;

    @IsOptional()
    @IsString()
    packId?: string;
}

/** Pay an existing booking with a pack; no purchase means the soonest to expire. */
export class UsePackDto {
    @IsOptional()
    @IsString()
    @MaxLength(64)
    packPurchaseId?: string;
}
