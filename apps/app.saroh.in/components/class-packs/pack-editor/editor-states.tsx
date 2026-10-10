import { PageContainer } from "@/components/shared/page-container";
import { Button } from "@saroh/ui/button";
import {
    EmptyState,
    FailedState,
    PermissionDeniedState,
} from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { NotFound } from "@saroh/ui/not-found";
import { PageHeader } from "@saroh/ui/page-header";
import { Archive } from "lucide-react";
import Link from "next/link";

import { readOnlyLine, whoCanChange } from "@/components/shared/who-can-change";
import { packCrumbs } from "./pack-crumbs";

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
/** The one sentence for a denial (`whoCanChange`). */
const DENIED = whoCanChange({ thing: "Class packs" });

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
        <PageContainer width="full">
            <PageHeader
                breadcrumb={packCrumbs(here)}
                title={here ?? "Class pack"}
            />
            {state === "missing" || state === "archived" ? (
                <div>
                    {state === "missing" ? (
                        <NotFound
                            variant="card"
                            title="Class pack not found"
                            description="The link may be old, or the draft was deleted."
                            primary={{
                                href: BACK_TO_PACKS.href,
                                label: BACK_TO_PACKS.label,
                            }}
                        />
                    ) : (
                        <EmptyState
                            icon={<Archive />}
                            title="This pack is archived"
                            description="Nobody can buy it, and everyone holding one keeps using it."
                            action={
                                <Button
                                    asChild
                                    variant="outline"
                                    className="wk-press"
                                >
                                    <Link href={BACK_TO_PACKS.href}>
                                        {BACK_TO_PACKS.label}
                                    </Link>
                                </Button>
                            }
                        />
                    )}
                </div>
            ) : (
                <div>
                    {state === "failed" ? (
                        <FailedState
                            title={couldntLoad("this pack")}
                            retryHref={retryHref}
                            action={
                                <Button
                                    asChild
                                    variant="ghost"
                                    className="wk-press"
                                >
                                    <Link href={BACK_TO_PACKS.href}>
                                        {BACK_TO_PACKS.label}
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <PermissionDeniedState
                            title={
                                state === "forbidden"
                                    ? DENIED.title
                                    : "You can't change class packs"
                            }
                            description={
                                state === "forbidden"
                                    ? DENIED.description
                                    : readOnlyLine("class packs", true)
                            }
                            note={DENIED.note}
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
        </PageContainer>
    );
}
