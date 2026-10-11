import { prisma } from "@saroh/database";

import { OrganizationLifecycleStatus } from "./organization-lifecycle.policy";

/**
 * One provider call made on a business's way out (#921, owner 9 Oct): a
 * refund sent or looked up while it is closing, Saroh's own billing
 * cancelled, a custom hostname or a stored file removed, the customers'
 * autopay mandates read, keys removed.
 */
export interface DeletionProviderCall {
    organizationId: string;
    /** razorpay, cashfree, cloudflare, storage, resend, saroh… lower case. */
    provider: string;
    /** What was asked, dotted: `refund.send`, `billing.cancel`, `keys.remove`. */
    call: string;
    /** `ok`, or what went wrong as a word or an error's class: `refused`, `unknown`, `error:TypeError`. */
    result: string;
    /** The provider's or Saroh's id for the thing acted on; never personal data, a card or a key. */
    ref?: string | null;
}

/**
 * The one structured line an operator follows a deletion by:
 * `deletion_provider_call org=… provider=… call=… result=… ref=…`. Every
 * value is squeezed to an id's characters, so nothing a provider sent
 * (a message, an address) can ride along.
 */
export function deletionProviderCallLine(call: DeletionProviderCall): string {
    return [
        "deletion_provider_call",
        `org=${token(call.organizationId)}`,
        `provider=${token(call.provider.toLowerCase())}`,
        `call=${token(call.call)}`,
        `result=${token(call.result)}`,
        `ref=${call.ref ? token(call.ref) : "-"}`,
    ].join(" ");
}

/** Log it: INFO when the call worked, WARN when it didn't. */
export function logDeletionProviderCall(
    logger: { log(message: string): void; warn(message: string): void },
    call: DeletionProviderCall,
): void {
    const line = deletionProviderCallLine(call);
    if (call.result === "ok") logger.log(line);
    else logger.warn(line);
}

/** An error's class only, for `result`: a message could carry anything. */
export function errorResult(error: unknown): string {
    return error instanceof Error ? `error:${error.name}` : "error:unknown";
}

/** Whether this lifecycle state is on the way out: closing or deleted. */
export function lifecycleLeaving(status: string): boolean {
    return (
        status === OrganizationLifecycleStatus.PendingDeletion ||
        status === OrganizationLifecycleStatus.DeletedRetained
    );
}

/** Whether this business is on its way out; false for a missing one. */
export async function businessLeaving(
    organizationId: string,
): Promise<boolean> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    return organization
        ? lifecycleLeaving(organization.lifecycleStatus)
        : false;
}

function token(value: string): string {
    // No `@`: an email address never reads as a ref.
    const cleaned = value.replace(/[^A-Za-z0-9_.:/-]/g, "_").slice(0, 120);
    return cleaned.length > 0 ? cleaned : "-";
}
