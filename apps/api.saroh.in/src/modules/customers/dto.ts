import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

import { StoreListQueryDto } from "../../common/store-list-query";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

export class CreateCustomerDto {
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid email is required" })
    email!: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    firstName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    lastName?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(40)
    phone?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    country?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    state?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    city?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(20)
    zipCode?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {}

/** A page of a store's customers, or the one with this email. */
export class ListStoreCustomersQueryDto extends StoreListQueryDto {
    @IsOptional()
    @Transform(trimLower)
    @IsString()
    @MaxLength(320)
    email?: string;
}
