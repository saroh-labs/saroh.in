import { Transform, Type } from "class-transformer";
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsEmail,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    IsUrl,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
    ValidateNested,
} from "class-validator";

import type { SocialNetwork } from "@saroh/block-contract";
import { MAP_LINK_MAX, SOCIAL_INPUT_MAX } from "@saroh/block-contract";

import { NewBillingProfileDto } from "../billing/billing-profile.dto";
import type { GstPriceMode } from "../invoices/gst-price";
import { GST_PRICE_MODES } from "../invoices/gst-price";
import {
    MAX_COUNTER_DIGITS,
    MIN_COUNTER_DIGITS,
    NUMBER_PARTS,
    NUMBER_RESTARTS,
    NUMBER_SEPARATORS,
} from "../invoices/numbering";
import {
    COLOUR_INPUT,
    COLOUR_MESSAGE,
    STYLE_INPUTS,
    STYLE_MESSAGE,
} from "../invoices/paper-styles";

import { managerCodeOf } from "./account-manager";
import type { AcceptedBusinessType } from "./business-type";
import { ACCEPTED_BUSINESS_TYPES } from "./business-type";
import type { OrganizationKind } from "./organization-kind";
import { ORGANIZATION_KINDS } from "./organization-kind";
import { referralCodeOf } from "./referral";

export { BUSINESS_TYPES, type BusinessType } from "./business-type";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Optional business identity supplied at onboarding (S1-004). Every field is
 * optional — an org can onboard with a name alone and complete this later.
 */
export class BusinessProfileDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(200)
    legalName?: string;

    /**
     * The legal form (`business-type.ts`): one of the six, or the old
     * `company` (stored as `pvt`) until Z4. "" clears it to Not set.
     */
    @ValidateIf((_o, v: unknown) => v != null && v !== "")
    @Transform(trimLower)
    @IsIn(ACCEPTED_BUSINESS_TYPES, { message: "Unknown business type" })
    type?: AcceptedBusinessType | "";

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(2, { message: "Country must be an ISO 3166-1 alpha-2 code" })
    country?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(100)
    taxId?: string;

    // "" clears it, as the settings form clears any field; `@IsOptional`
    // lets only null and undefined through, so it was refused as invalid.
    @ValidateIf((_o, v: unknown) => v != null && v !== "")
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid contact email is required" })
    contactEmail?: string;

    @ValidateIf((_o, v: unknown) => v != null && v !== "")
    @Transform(trim)
    @IsUrl({}, { message: "A valid website URL is required" })
    website?: string;

    /**
     * IANA zone the business keeps time in, e.g. "Asia/Kolkata". New
     * subscriptions renew on its midnight (ADR-007). Checked against the tz
     * database in the service.
     */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(64)
    timezone?: string;

    /**
     * The business's public phone (DEC-053), shown on its site. "" clears
     * it. Its shape — E.164, "+91 98450 12345" kept as "+919845012345" — is
     * checked by the settings save (`business-phone.ts`), which names the
     * field; onboarding does not take it.
     */
    @IsOptional()
    @IsString()
    @MaxLength(32, { message: "That phone number is too long" })
    phone?: string;
}

/**
 * The profile setup sends: the settings fields, and setup's own answer to
 * "Is it registered?". Registered sends `registered: true` and no type
 * (Pvt Ltd, LLP and partnership aren't guessed at); the business is asked
 * for the real one before it goes live. Settings never takes it: the type
 * itself is the answer from then on.
 */
export class OnboardingProfileDto extends BusinessProfileDto {
    @IsOptional()
    @IsBoolean()
    registered?: boolean;
}

/** The goals setup offers: four modules, and invoicing, which needs none. */
export const FIRST_GOALS = [
    "COMMERCE",
    "APPOINTMENTS",
    "WEBSITE",
    "CRM",
    "INVOICE",
] as const;
export type FirstGoal = (typeof FIRST_GOALS)[number];

/**
 * Payload for `POST /organizations` (S1-004). Carries only the business
 * identity — never the owner. Ownership is derived from the authenticated
 * caller, so this DTO deliberately has no `userId`/`ownerId`/`role` field.
 */
export class OnboardOrganizationDto {
    /** Human display name for the organization; also seeds the slug. */
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Enter the business's name." })
    @MaxLength(120)
    name!: string;

    /** Optional nested business profile (legal/tax/contact details). */
    @IsOptional()
    @ValidateNested()
    @Type(() => OnboardingProfileDto)
    profile?: OnboardingProfileDto;

    /**
     * The business's address on Saroh — the `<address>.saroh.app` its website
     * will live at — chosen at setup. Optional: absent, it is derived from
     * the name, as it always was. Its shape, the reserved words and whether
     * it is free are checked by the service (`site-address.ts`), where the
     * answer can name the field and say why.
     */
    @IsOptional()
    @Transform(trimLower)
    @IsString()
    @MaxLength(63)
    address?: string;

    /**
     * What is being set up (DEC-070): BUSINESS, SOLO ("Just me") or WORK
     * ("A site for my work"). It changes words and defaults only. Absent
     * (an app from before it), the business is a BUSINESS.
     */
    @IsOptional()
    @IsIn(ORGANIZATION_KINDS, {
        message: "kind must be BUSINESS, SOLO or WORK",
    })
    kind?: OrganizationKind;

    /**
     * What they chose to do first on the setup screen (UX audit, 10 Oct):
     * one of {@link FIRST_GOALS}. It turns nothing on (the app does that,
     * module by module) and decides no access. The welcome email leads with
     * its next step. Absent: they will decide later.
     */
    @IsOptional()
    @IsIn(FIRST_GOALS, { message: "goal is not one Saroh offers" })
    goal?: FirstGoal;

    /**
     * The referral code the browser carried from saroh.in, if any
     * (DEC-156). Never refused: anything not shaped like a code is dropped
     * here, and one that names no business is ignored by the service
     * (`referral.ts`), so a bad link can't stop a business being made.
     */
    @Transform(
        ({ value }: { value: unknown }) => referralCodeOf(value) ?? undefined,
    )
    @IsOptional()
    @IsString()
    referralCode?: string;

    /**
     * The account manager's code from the `?am=` link the browser carried
     * from saroh.in (DEC-169, the `saroh_am` cookie), sent by the
     * workspace, never typed. Never refused: anything not shaped like a
     * code is dropped, and one that names no active manager links nobody
     * (`account-manager.ts`), so a bad link can't stop a business being
     * made.
     */
    @Transform(
        ({ value }: { value: unknown }) => managerCodeOf(value) ?? undefined,
    )
    @IsOptional()
    @IsString()
    managerLinkCode?: string;

    /** When that link was kept (ISO 8601), stored as the link's evidence. */
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" && value.length <= 40 ? value : undefined,
    )
    @IsOptional()
    @IsString()
    managerLinkSetAt?: string;

    /**
     * The code of the Saroh teammate helping them, typed by the owner at
     * setup (DEC-169). Dropped like the link's when it isn't shaped like a
     * code; one that names no active manager links nobody.
     */
    @Transform(
        ({ value }: { value: unknown }) => managerCodeOf(value) ?? undefined,
    )
    @IsOptional()
    @IsString()
    managerCode?: string;

    /**
     * Who Saroh bills for it (DEC-167, R7): one of the caller's own billing
     * profiles. An owner who has a profile already must choose, this or
     * {@link newBillingProfile}; one who has none gets their first from the
     * business's details. Whose it is is checked by the service: another
     * person's is a 404, as if it didn't exist.
     */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    billingProfileId?: string;

    /** Or a new profile, made with the business in its transaction. */
    @IsOptional()
    @ValidateNested()
    @Type(() => NewBillingProfileDto)
    newBillingProfile?: NewBillingProfileDto;
}

const DIGITS_MESSAGE = `The counter is ${MIN_COUNTER_DIGITS} to ${MAX_COUNTER_DIGITS} digits.`;

/**
 * How the business's invoice numbers are built (`numbering.ts`,
 * NumberFormat), sent whole. Its shape is checked here; whether it suits the
 * business — unique across years, within 16 characters, a restart GST
 * allows — by the service, which names the field.
 */
export class InvoiceNumberFormatDto {
    /**
     * The parts before the counter, in order: PREFIX, FY ("26-27"),
     * FY_SHORT ("26"), YEAR, MONTH.
     */
    @IsArray()
    @ArrayUnique({ message: "Each part can be in the number once." })
    @ArrayMaxSize(NUMBER_PARTS.length)
    @IsIn(NUMBER_PARTS, {
        each: true,
        message: "That is not a part a number can carry.",
    })
    parts!: string[];

    @IsIn(NUMBER_SEPARATORS, {
        message: 'The separator is "/", "-" or no separator ("").',
    })
    separator!: string;

    @IsInt({ message: DIGITS_MESSAGE })
    @Min(MIN_COUNTER_DIGITS, { message: DIGITS_MESSAGE })
    @Max(MAX_COUNTER_DIGITS, { message: DIGITS_MESSAGE })
    digits!: number;

    /** FY: every financial year; MONTH: every month; NEVER: one counter. */
    @IsIn(NUMBER_RESTARTS, {
        message: "Numbers restart every financial year, every month or never.",
    })
    restart!: string;
}

/**
 * The business's GST settings (ADR-008). Owner/Admin, like the rest of the
 * profile (`org:update`). The GSTIN is the profile's `taxId`; switching
 * registration on checks it (shape, state, check character) against the
 * state. "" clears a text field.
 */
export class TaxSettingsDto {
    @IsOptional()
    @IsBoolean()
    registered?: boolean;

    /** A GST state code ("29") or its name ("Karnataka"). */
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    state?: string;

    /** One to three capitals or digits: RC → RC/26-27/0001. */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) =>
        typeof value === "string" ? value.trim() : value,
    )
    @IsString()
    @MaxLength(10)
    invoicePrefix?: string;

    /** The GST rate on delivery, in percent. */
    @IsOptional()
    @Transform(trim)
    @Matches(/^\d{1,2}(\.\d{1,2})?$/, { message: "A GST rate like 5 or 18" })
    deliveryRate?: string;

    /** The SAC code delivery is billed under; "" clears it. */
    @IsOptional()
    @Transform(trim)
    @Matches(/^(\d{4,8})?$/, { message: "A SAC code is 4 to 8 digits" })
    deliverySac?: string;

    /** How invoice numbers are built; absent, unchanged. */
    @IsOptional()
    @ValidateNested()
    @Type(() => InvoiceNumberFormatDto)
    invoiceNumber?: InvoiceNumberFormatDto;

    /**
     * How the business's prices carry GST (12 Oct 2026): INCLUDED ("My
     * prices include GST") or ADDED ("GST is added to my prices"). Only a
     * GST-registered business chooses; the service refuses it otherwise.
     */
    @IsOptional()
    @IsIn(GST_PRICE_MODES, {
        message: "Choose whether your prices include GST or GST is added.",
    })
    priceMode?: GstPriceMode;
}

/**
 * The business's registered address (CGST rule 46: a tax invoice names the
 * supplier's address). Its state is the GST state (`tax.state`), so the two
 * can never disagree. "" clears a line. The service checks the PIN (six
 * digits, India) and refuses a GST-registered business without an address.
 */
export class RegisteredAddressDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    line1?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(120)
    line2?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(60)
    city?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @MaxLength(12)
    postalCode?: string;
}

/**
 * "How to pay us" (R32): a UPI ID, bank details and a short note, shown to a
 * customer on their own unpaid invoice, order or booking. "" clears a
 * field. Only the type and an outer length are checked here; the shapes
 * (UPI ID, IFSC, account number) and that bank details go together are the
 * service's (`business-pay-instructions.ts`), which names the field.
 */
export class PayInstructionsDto {
    @IsOptional()
    @IsString()
    @MaxLength(300)
    upiId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    bankAccountName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    bankAccountNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    bankIfsc?: string;

    @IsOptional()
    @IsString()
    @MaxLength(300)
    bankName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(600)
    note?: string;
}

/**
 * How the business's invoices look by default (DEC-173, #1118): CLASSIC,
 * BAND or COMPACT, and a colour as `#RRGGBB`. "" clears either, back to
 * Classic in ink. Owner/Admin (`org:update`), as the tax settings are. A
 * draft may choose its own; issued paper keeps the look it went out in.
 */
export class InvoicePaperDto {
    @IsOptional()
    @Transform(trim)
    @IsIn(STYLE_INPUTS, { message: STYLE_MESSAGE })
    style?: string;

    @IsOptional()
    @Transform(trim)
    @IsString()
    @Matches(COLOUR_INPUT, { message: COLOUR_MESSAGE })
    colour?: string;
}

/**
 * Payload for `PATCH /organizations/:organizationId`. Both fields are optional
 * so a caller can rename the org, edit the business profile, or both.
 *
 * Deliberately absent: `slug`. It is the org's stable public identifier (unique
 * index, and it is embedded in published site content), so renaming the org does
 * NOT re-slug it. The global ValidationPipe runs with `forbidNonWhitelisted`, so
 * a client that tries to send one gets an explicit 400 rather than a silent
 * no-op. Also absent: anything about ownership or membership — those move only
 * through the membership endpoints.
 */
/** A link's field: text, held to the longest a network's link runs. */
const SocialLink = () => (target: object, key: string) => {
    IsOptional()(target, key);
    IsString()(target, key);
    MaxLength(SOCIAL_INPUT_MAX, { message: "That link is too long." })(
        target,
        key,
    );
};

/**
 * The business's social links (DEC-128): for each network a handle
 * ("@rye") or a pasted link, "" to clear it; a network left out stays as it
 * is. Only the fixed list below is taken (the pipe refuses any other key),
 * and each value is rebuilt into one canonical address on the network's own
 * host by the settings save (`business-social.ts`), which names the field
 * it refuses. No other address is accepted.
 */
export class SocialLinksDto implements Partial<Record<SocialNetwork, string>> {
    @SocialLink() instagram?: string;
    @SocialLink() facebook?: string;
    /** A phone number with its country code; kept as a wa.me link. */
    @SocialLink() whatsapp?: string;
    @SocialLink() youtube?: string;
    @SocialLink() x?: string;
    @SocialLink() linkedin?: string;
    @SocialLink() pinterest?: string;
    @SocialLink() telegram?: string;
}

export class UpdateOrganizationDto {
    @IsOptional()
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "Enter the business's name." })
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessProfileDto)
    profile?: BusinessProfileDto;

    /** GST (ADR-008): registration, state, invoice prefix, delivery rate. */
    @IsOptional()
    @ValidateNested()
    @Type(() => TaxSettingsDto)
    tax?: TaxSettingsDto;

    /** The registered address, printed on invoices (ADR-008). */
    @IsOptional()
    @ValidateNested()
    @Type(() => RegisteredAddressDto)
    registeredAddress?: RegisteredAddressDto;

    /** How to pay us (R32): shown on a customer's own unpaid paper. */
    @IsOptional()
    @ValidateNested()
    @Type(() => PayInstructionsDto)
    payInstructions?: PayInstructionsDto;

    /**
     * What is being set up (DEC-070): BUSINESS, SOLO ("Just me") or WORK
     * ("A site for my work"). It changes words and defaults only. Absent, it
     * is left as it is.
     */
    @IsOptional()
    @IsIn(ORGANIZATION_KINDS, {
        message: "kind must be BUSINESS, SOLO or WORK",
    })
    kind?: OrganizationKind;

    /** The business's social links (DEC-128), a field per network. */
    @IsOptional()
    @ValidateNested()
    @Type(() => SocialLinksDto)
    socialLinks?: SocialLinksDto;

    /**
     * Its website shows the registered address as where to find it
     * (DEC-128), while no location customers visit has one. Absent, it is
     * left as it is.
     */
    @IsOptional()
    @IsBoolean()
    siteShowsRegisteredAddress?: boolean;

    /**
     * The registered address's place on Google Maps (DEC-128): what "Get
     * directions" opens while the website shows that address. "" clears
     * it. Only Google's own map links are kept; the settings save checks
     * it and names the field (`map-link.ts`).
     */
    @IsOptional()
    @IsString()
    @MaxLength(MAP_LINK_MAX, { message: "That link is too long." })
    registeredAddressMapUrl?: string;

    /** The invoices' default style and colour (DEC-173, #1118). */
    @IsOptional()
    @ValidateNested()
    @Type(() => InvoicePaperDto)
    invoicePaper?: InvoicePaperDto;
}

/**
 * Set the business logo to an image the business uploaded to its library
 * (`POST /organizations/:id/media/upload-url`, then `/complete`).
 */
export class SetLogoDto {
    @Transform(trim)
    @IsString()
    @MinLength(1, { message: "mediaId is required" })
    @MaxLength(64)
    mediaId!: string;
}
