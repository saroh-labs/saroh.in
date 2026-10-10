import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
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
        <main className="w-full">
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px] text-[12px]"
            >
                <Link
                    href="/bookings"
                    className="text-muted-foreground hover:text-foreground"
                >
                    Bookings
                </Link>
                <span aria-hidden className="text-muted-foreground">
                    ›
                </span>
                <Link
                    href="/services"
                    className="text-muted-foreground hover:text-foreground"
                >
                    Services
                </Link>
            </nav>
            {state === "missing" ? (
                <div className="px-6 py-10 max-[759px]:px-4">
                    <div className="max-w-[480px] rounded-[12px] border border-border bg-card px-[18px] py-4">
                        <h1 className="mb-2.5 font-display text-[16px] font-semibold tracking-[-0.01em]">
                            That service isn&apos;t here
                        </h1>
                        <Link
                            href="/services"
                            className="text-[13px] font-semibold text-brand transition-colors hover:text-foreground active:text-muted-foreground"
                        >
                            Back to services
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="px-[22px] py-[60px] max-[759px]:px-4">
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
        </main>
    );
}
