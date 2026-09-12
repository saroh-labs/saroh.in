import { Transform } from "class-transformer";
import {
    ArrayMaxSize,
    IsArray,
    IsEmail,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
} from "class-validator";

import type { OrgRole } from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";

const trim = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value;

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Invite someone to the organization (#276).
 *
 * The role is validated against {@link ORG_ROLES} rather than accepted as a
 * string: `organization-context.service.ts` turns an unrecognized role into
 * MEMBER and logs it, so a typo here would silently hand someone the whole
 * read-only floor — the roster, the stores, every site — instead of the
 * narrow role that was meant.
 */
export class InviteMemberDto {
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid email address is required" })
    @MaxLength(320)
    email!: string;

    @Transform(trim)
    @IsIn(ORG_ROLES, { message: "Unknown role" })
    role!: OrgRole;

    /**
     * Sites a REVIEWER invite grants. Required for REVIEWER and rejected for
     * every other role — the service decides that, because "which sites" is a
     * question only this role asks.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    siteIds?: string[];
}

/**
 * Change a member's role, and for a REVIEWER which sites they may review.
 *
 * `siteIds` replaces the grants outright rather than adding to them: an edit
 * screen shows the current set, and a merchant unticking a site means that
 * site is no longer theirs to see.
 */
export class UpdateMemberRoleDto {
    @Transform(trim)
    @IsIn(ORG_ROLES, { message: "Unknown role" })
    role!: OrgRole;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    siteIds?: string[];
}
