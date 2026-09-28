import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";

import { PackCrumbs } from "./pack-crumbs";

export type PackEditorStateKind =
    "missing" | "failed" | "forbidden" | "readOnly" | "archived";

const BACK_TO_PACKS = { href: "/class-packs", label: "Back to Packs" };

/**
 * The Pack Editor when there is nothing to edit (E18, after the design's
 * states): a pack that isn't here, a read that failed, a role that can't
 * see packs or can't change them, and an archived pack. A failed read is
 * never "isn't here", and a role that can't change packs sees a locked card
 * that says who can — the design locks the whole editor rather than
 * drawing a form that can't be used.
 */
export function PackEditorState({
    state,
    retryHref,
    here = null,
}: {
    state: PackEditorStateKind;
    /** Where Try again goes: this page again. */
    retryHref: string;
    /** The crumb's last part, when the pack's name is known. */
    here?: string | null;
}) {
    return (
        <main className="w-full">
            <PackCrumbs here={here} />
            {state === "missing" || state === "archived" ? (
                <div className="px-6 py-10 max-[759px]:px-4">
                    <div className="max-w-[480px] rounded-[12px] border border-dashed border-border-strong px-5 py-8 text-center">
                        <h1 className="m-0 text-[15px] font-semibold">
                            {state === "missing"
                                ? "That pack isn't here"
                                : "This pack is archived"}
                        </h1>
                        {state === "archived" ? (
                            <p className="mx-auto mt-1.5 max-w-[46ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                                Nobody can buy it, and everyone holding one
                                keeps using it. Put it back on sale from Packs
                                to change it.
                            </p>
                        ) : null}
                        <Link
                            href={BACK_TO_PACKS.href}
                            className="mt-2 inline-block rounded-[4px] text-[13px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground/70 coarse:min-h-11 coarse:pt-3"
                        >
                            Back to packs
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="px-[22px] py-[60px] max-[759px]:px-4">
                    {state === "failed" ? (
                        <FailedState
                            title="Couldn't load this pack"
                            description="The connection dropped while we were fetching it. Nothing has changed — try again, or come back in a minute."
                            action={
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button asChild>
                                        <Link href={retryHref}>Try again</Link>
                                    </Button>
                                    <Button asChild variant="outline">
                                        <Link href={BACK_TO_PACKS.href}>
                                            {BACK_TO_PACKS.label}
                                        </Link>
                                    </Button>
                                </div>
                            }
                        />
                    ) : (
                        <PermissionDeniedState
                            title={
                                state === "forbidden"
                                    ? "You can't open packs"
                                    : "Your role can't change packs"
                            }
                            description={
                                state === "forbidden"
                                    ? "Your role doesn't reach class packs."
                                    : "You can see packs and who holds them, but not make or change one."
                            }
                            note="An owner or admin can change what your role reaches in Team."
                            action={
                                <Button asChild variant="outline">
                                    {state === "forbidden" ? (
                                        <Link href="/">Back to Home</Link>
                                    ) : (
                                        <Link href={BACK_TO_PACKS.href}>
                                            {BACK_TO_PACKS.label}
                                        </Link>
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
