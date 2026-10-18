import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * A new billing profile (DEC-167), as an owner types it: who Saroh bills.
 *
 * Only its shape is checked here, loosely: each field is a string of a
 * bounded length. What each must be (a legal name, an email the owner
 * doesn't already use, a GSTIN of the address's state, a six-digit PIN) is
 * checked by the profile's own save (`billing-profiles.service.ts`), which
 * names the field it refuses, so the app can say it under that field. A
 * class-validator refusal could only reach it as a bare "Validation failed".
 */
export class NewBillingProfileDto {
    @IsString()
    @MaxLength(300)
    legalName!: string;

    @IsString()
    @MaxLength(320)
    billingEmail!: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    addressLine1?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    addressLine2?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    city?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    postalCode?: string;

    /** The state's GST code ("29") or its name. */
    @IsOptional()
    @IsString()
    @MaxLength(60)
    gstState?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    gstin?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    phone?: string;
}
