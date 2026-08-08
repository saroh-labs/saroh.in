import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";

/** Staff roles a StoreMembers row may hold (owners are tracked separately). */
export const MEMBER_ROLES = ["ADMIN", "MANAGER", "EDITOR", "VIEWER"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

export class InviteMemberDto {
    @Transform(trimLower)
    @IsEmail({}, { message: "A valid email is required" })
    email!: string;

    @IsOptional()
    @IsString()
    @IsIn(MEMBER_ROLES, { message: "Unknown role" })
    role?: MemberRole;
}

export class UpdateMemberRoleDto {
    @IsString()
    @IsIn(MEMBER_ROLES, { message: "Unknown role" })
    role!: MemberRole;
}
