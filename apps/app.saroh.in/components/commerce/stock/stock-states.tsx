import { AccessDenied } from "@/components/shared/access-denied";
import { PageContainer } from "@/components/shared/page-container";

import { StockHeader } from "./stock-header";
import { TurnOnTracking } from "./turn-on-tracking";

/**
 * The two states the Stock screen shows instead of its tabs (#527): a role
 * that can't read stock, and a business that doesn't track it.
 */

/** "You can't open stock", with who can change it. */
export function StockLocked({
    business,
    role,
}: {
    business: string;
    role: string;
}) {
    return (
        <AccessDenied
            title="You can't open stock"
            description={`You're signed in as ${role} in ${business}. That role doesn't include seeing products or stock. An owner or admin can give you access in Team.`}
            note={null}
            backLabel="Go to Home"
        />
    );
}

/**
 * Track stock is off for the whole business (#515): nothing counts, so
 * there are no levels or log. Someone who may change products can turn it
 * on here; anyone else is told who can.
 */
export function StockTrackingOff({
    business,
    canChange,
}: {
    business: string | null;
    canChange: boolean;
}) {
    return (
        <PageContainer width="full">
            <StockHeader subline={null} />
            <div className="px-0 py-10 sm:py-[60px]">
                <div className="mx-auto flex max-w-[560px] flex-col items-center gap-[9px] rounded-xl border border-dashed border-border-strong px-6 py-9 text-center">
                    <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {business
                            ? `Stock isn't tracked for ${business}`
                            : "Stock isn't tracked"}
                    </h2>
                    <p className="max-w-[48ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                        Products sell without a count, so there are no levels or
                        log to show.{" "}
                        {canChange
                            ? "Turn it on if you want Saroh to count stock. Every shelf starts at 0 until you count it."
                            : "An owner or admin can turn it on if you want Saroh to count stock."}
                    </p>
                    {canChange ? <TurnOnTracking /> : null}
                </div>
            </div>
        </PageContainer>
    );
}
