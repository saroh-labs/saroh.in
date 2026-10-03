import { Badge } from "@saroh/ui/badge";

/**
 * Where an invited person's invite stands (marketing U31): they made their
 * business with it, it left, or it is still being sent. Takes plain fields,
 * so a client or server component can use it.
 */
export function InviteState({
    row,
}: {
    row: { inviteSentAt: string | null; joinedAt: string | null };
}) {
    const [label, variant] = row.joinedAt
        ? (["Joined", "success"] as const)
        : row.inviteSentAt
          ? (["Invite sent", "neutral"] as const)
          : (["Sending", "info"] as const);
    return (
        <Badge variant={variant} className="mt-1 w-fit">
            {label}
        </Badge>
    );
}
