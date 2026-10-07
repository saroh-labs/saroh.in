import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import Link from "next/link";

/**
 * The Service Editor when there is nothing to edit (E2, after the design):
 * a service that isn't here, a read that failed, or a role that can't see
 * services. A failed read is never "isn't here".
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
                    <FailedState
                        title={
                            state === "cant-add"
                                ? "Your role can't add services"
                                : state === "forbidden"
                                  ? "Your role can't see services"
                                  : "Couldn't load this service"
                        }
                        description={
                            state === "forbidden" || state === "cant-add"
                                ? "An owner or admin can change what your role reaches in Team."
                                : "The connection dropped while we were fetching it. Nothing has changed — try again, or come back in a minute."
                        }
                        action={
                            <div className="flex flex-wrap justify-center gap-2">
                                {state === "failed" ? (
                                    <Button asChild>
                                        <Link href={retryHref}>Try again</Link>
                                    </Button>
                                ) : null}
                                <Button asChild variant="outline">
                                    <Link href="/services">
                                        Back to services
                                    </Link>
                                </Button>
                            </div>
                        }
                    />
                </div>
            )}
        </main>
    );
}
