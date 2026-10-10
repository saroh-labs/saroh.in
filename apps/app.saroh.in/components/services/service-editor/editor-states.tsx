import { PageContainer } from "@/components/shared/page-container";
import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { whoCanChange } from "@/components/shared/who-can-change";
import { backTo, couldntLoad } from "@saroh/ui/lib/state-copy";

/**
 * The Service Editor when there is nothing to edit (E2, after the design):
 * a service that isn't here, a read that failed, or a role that can't see
 * services. A failed read is never "isn't here", and a role that can't is
 * never a failed read: it gets the denied card, with no retry, because
 * nothing broke.
 */
export function ServiceEditorState({
    state,
    retryHref,
}: {
    /** "cant-add": the role sees services but can't add one (UX-083). */
    state: "missing" | "failed" | "forbidden" | "cant-add";
    /** Where Try again goes: this page again. */
    retryHref: string;
}) {
    return (
        <PageContainer width="full">
            <PageHeader
                breadcrumb={[
                    <Link key="bookings" href="/bookings">
                        Bookings
                    </Link>,
                    <Link key="services" href="/services">
                        Services
                    </Link>,
                ]}
                title="Service"
            />
            {state === "missing" ? (
                <div>
                    <div className="max-w-[480px] rounded-[12px] border border-border bg-card px-[18px] py-4">
                        <h2 className="mb-2.5 font-display text-[16px] font-semibold tracking-[-0.01em]">
                            That service isn&apos;t here
                        </h2>
                        <Link
                            href="/services"
                            className="text-[13px] font-semibold text-brand transition-colors hover:text-foreground active:text-muted-foreground"
                        >
                            Back to services
                        </Link>
                    </div>
                </div>
            ) : (
                <div>
                    {state === "failed" ? (
                        <FailedState
                            title={couldntLoad("this service")}
                            retryHref={retryHref}
                            action={
                                <Button
                                    asChild
                                    variant="ghost"
                                    className="wk-press"
                                >
                                    <Link href="/services">
                                        {backTo("Services")}
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <PermissionDeniedState
                            {...whoCanChange({
                                thing:
                                    state === "cant-add"
                                        ? "New service"
                                        : "Services",
                            })}
                            action={
                                <Button asChild variant="outline">
                                    {state === "cant-add" ? (
                                        <Link href="/services">
                                            Back to services
                                        </Link>
                                    ) : (
                                        // The list would only say the same.
                                        <Link href="/">Back to Home</Link>
                                    )}
                                </Button>
                            }
                        />
                    )}
                </div>
            )}
        </PageContainer>
    );
}
