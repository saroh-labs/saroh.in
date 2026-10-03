import { Button } from "@saroh/ui/button";
import Link from "next/link";

import { PageContainer } from "@/components/shared/page-container";

/**
 * A page the workspace doesn't have, inside the workspace: the rail and the
 * header stay, so the way on is where it always is. Among others, what a
 * module Saroh hasn't rolled out to this business finds (DEC-057,
 * `ModuleGate`) — no page, rather than "turned off" with a switch Settings
 * doesn't show.
 */
export default function ShellNotFound() {
    return (
        <PageContainer>
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
                <h1 className="font-display text-[20px] font-semibold">
                    Page not found
                </h1>
                <p className="text-pretty text-sm text-muted-foreground">
                    The page you&apos;re looking for doesn&apos;t exist, or you
                    don&apos;t have access to it.
                </p>
                <Button asChild variant="outline" className="wk-press">
                    <Link href="/">Back to Home</Link>
                </Button>
            </div>
        </PageContainer>
    );
}
