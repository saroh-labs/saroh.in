import type { PostApproval, PostApprover } from "@/lib/content/service";

/**
 * The words of a post's approval (O7, `blogdesk/WXWPublish`,
 * `blogphone/WXYApproval`): who can approve, and the status a post waiting
 * for them shows.
 */

/** "Kavya" from "Kavya Iyer"; an email stays whole. */
export function firstName(name: string): string {
    return name.includes("@") ? name : (name.trim().split(/\s+/)[0] ?? name);
}

const ROLE_WORD: Record<PostApprover["role"], string> = {
    REVIEWER: "reviewer",
    ADMIN: "admin",
    OWNER: "owner",
};

/** "a, b or c". */
function orList(parts: string[]): string {
    if (parts.length <= 1) return parts.join("");
    return `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

/** "Kavya (reviewer) or Mohit (owner)". */
export function approversLine(approvers: PostApprover[]): string {
    return orList(
        approvers.map((a) => `${firstName(a.name)} (${ROLE_WORD[a.role]})`),
    );
}

/** "Either can approve. Both hear about it now." */
export function approversNote(n: number): string {
    if (n <= 1) return "They can approve it. They hear about it now.";
    if (n === 2) return "Either can approve. Both hear about it now.";
    return "Any one of them can approve. They all hear about it now.";
}

/**
 * The post's status while approval stands in the way, or null for the
 * usual one: "Waiting for Kavya's approval", "Kavya asked for changes".
 */
export function approvalStatus(approval: PostApproval | null): string | null {
    if (!approval?.on) return null;
    if (approval.state === "asked") {
        const by = approval.verdict?.by;
        return by
            ? `${firstName(by.name)} asked for changes`
            : "Changes asked for";
    }
    if (approval.state !== "waiting" || !approval.request) return null;
    const names = approval.approvers.map((a) => `${firstName(a.name)}'s`);
    return names.length > 0 && names.length <= 2
        ? `Waiting for ${orList(names)} approval`
        : "Waiting for approval";
}
