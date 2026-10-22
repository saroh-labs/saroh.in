import type { OrganizationRole } from "@/lib/organizations/service";

export const ROLES: OrganizationRole[] = [
    "OWNER",
    "ADMIN",
    "MEMBER",
    "REVIEWER",
];

export const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/**
 * What each role is for, in the words a small business would use — and only
 * what the API's policy grants (`organization-policy.ts`): a business may
 * have several owners and never none; an admin lacks closing the
 * business and changing what it pays Saroh (the plan, DEC-131 amended
 * 2026-10-11), so cannot change or remove an owner either; a member runs the
 * day — reads it and moves orders along — sees the business's settings
 * without changing them, and sees no money.
 */
export const ROLE_BLURB: Record<OrganizationRole, string> = {
    OWNER: "Can open and change everything. A business always has at least one owner, so it can never be locked out.",
    ADMIN: "Can do everything an owner can, except close the business, change the Saroh plan, or change or remove an owner.",
    MEMBER: "Runs the day: sees bookings, contacts and the team, and moves orders along as they're prepared. No money, and no business settings.",
    REVIEWER:
        "Can look at the websites they're invited to, comment and sign them off. Nothing else in the business.",
};

/** The same, in a few words, under a role's name wherever one is picked. */
export const ROLE_PLAIN: Record<OrganizationRole, string> = {
    OWNER: "can open everything",
    ADMIN: "everything except the Saroh plan and removing an owner",
    MEMBER: "runs the day, no money or settings",
    REVIEWER: "invited websites, nothing else",
};
