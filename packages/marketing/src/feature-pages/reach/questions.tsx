import { Container } from "../../layout/container";
import { TextLink } from "../../links/text-link";
import { FaqItems } from "../../sections/faq";

import { Fold } from "./fold";

export interface QuestionWords {
    q: string;
    a: string;
}

/** "Something else? Ask us →", and the phone's "All questions". */
export interface AskUsWords {
    lead: string;
    label: string;
    href: string;
    more: string;
}

/**
 * "Questions" (the boards' shared FAQ): the heading and "Something else?
 * Ask us →" beside the questions on desk. On a phone the first three show,
 * then "All questions" folds the rest; every question and answer stays in
 * the markup (the indexing rule).
 */
export function Questions({
    items,
    title = "Questions",
    ask,
}: {
    items: QuestionWords[];
    title?: string;
    ask: AskUsWords;
}) {
    const first = items.slice(0, 3);
    const rest = items.slice(3);
    return (
        <Container
            as="section"
            id="faq"
            aria-labelledby="faq-title"
            className="grid gap-6 pt-[72px] min-[760px]:pt-[120px] min-[1080px]:grid-cols-[380px_1fr] min-[1080px]:gap-24"
        >
            <div>
                <h2
                    id="faq-title"
                    className="m-0 font-display text-mk-kit-h2 font-bold"
                >
                    {title}
                </h2>
                <p className="m-0 mt-4 hidden text-[17px] text-mk-copy min-[760px]:block">
                    {ask.lead}{" "}
                    <TextLink href={ask.href} tone="ink" arrow>
                        {ask.label}
                    </TextLink>
                </p>
            </div>
            <div>
                <FaqItems items={first} />
                {rest.length ? (
                    <>
                        {/* Desk: the rest in line. Phone: folded, still in the markup. */}
                        <div className="hidden min-[760px]:block [&>div]:border-t-0">
                            <FaqItems items={rest} />
                        </div>
                        <Fold
                            phone
                            label={ask.more}
                            meta={`${rest.length} more`}
                            className="mt-1"
                        >
                            <FaqItems items={rest} />
                        </Fold>
                    </>
                ) : null}
                <p className="m-0 mt-4 text-[16px] text-mk-copy min-[760px]:hidden">
                    {ask.lead}{" "}
                    <TextLink href={ask.href} tone="ink" arrow>
                        {ask.label}
                    </TextLink>
                </p>
            </div>
        </Container>
    );
}
