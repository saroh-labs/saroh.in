import type { ReactNode } from "react";

import type { ChatWords } from "../content/types";
import { Container } from "../layout/container";
import { ScreenshotFrame } from "../media/screenshot-frame";
import type { ShotView } from "../media/shot";
import type { Crumb } from "../nav/breadcrumbs";
import { Breadcrumbs } from "../nav/breadcrumbs";
import { ChatExchange } from "./chat-exchange";

/**
 * A feature or solution page's opening (DEC-195, A5): the breadcrumb, the
 * headline, the sub, the site's buttons (`actions`), the free-plan line,
 * then the page's screenshot, which enlarges on click, and its note. A page
 * with no screen captured yet has neither. A hero in another company's app
 * (`chat`, AI apps) is drawn in place of the screenshot, not shot.
 */
export function ProductHero({
    section,
    name,
    headline,
    sub,
    narrow = false,
    actions,
    today,
    freeLine,
    shot,
    chat,
    note,
}: {
    /** The crumb before the page's own name: "Features", "Solutions". */
    section: Crumb & { href: string };
    /** The page's own name, the last crumb. */
    name: ReactNode;
    headline: string;
    sub: string;
    /** The feature template's 16ch headline; a solution's is 17ch. */
    narrow?: boolean;
    actions?: ReactNode;
    /** What works today, for a page that's limited: read as part of the sub. */
    today?: string;
    /** The free-plan line, from the site's read of its plans. */
    freeLine?: string;
    shot?: ShotView;
    /** Drawn in place of `shot` when given. */
    chat?: ChatWords;
    note?: string;
}) {
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-5 pt-[72px]"
            >
                <Breadcrumbs current="brand" crumbs={[section, { name }]} />
                <h1
                    className={`m-0 ${narrow ? "max-w-[16ch]" : "max-w-[17ch]"} font-display text-mk-display font-bold [text-wrap:balance]`}
                >
                    {headline}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {sub}
                </p>
                {today ? (
                    <p className="m-0 max-w-[60ch] text-mk-body text-mk-copy [text-wrap:pretty]">
                        {today}
                    </p>
                ) : null}
                {actions}
                {freeLine ? (
                    <p className="m-0 text-mk-note text-muted-foreground">
                        {freeLine}
                    </p>
                ) : null}
            </Container>
            {chat ? (
                <Container width="article" className="pt-14">
                    <ChatExchange words={chat} variant="hero" />
                </Container>
            ) : shot ? (
                <Container className="pt-14">
                    <ScreenshotFrame
                        shot={shot}
                        variant="hero"
                        zoomable
                        priority
                        sizes="(min-width: 1280px) 1168px, 100vw"
                    />
                    {note ? (
                        <p className="m-0 mt-3.5 text-sm text-muted-foreground">
                            {note}
                        </p>
                    ) : null}
                </Container>
            ) : null}
        </>
    );
}
