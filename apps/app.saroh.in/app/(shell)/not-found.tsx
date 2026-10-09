import { NotFound } from "@saroh/ui/not-found";

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
            <NotFound
                title="Page not found"
                description="This address isn't a page in your workspace. The link may be old or mistyped."
                primary={{ href: "/", label: "Back to Home" }}
            />
        </PageContainer>
    );
}
