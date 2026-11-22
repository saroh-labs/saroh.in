import { TextLink } from "../links/text-link";

/**
 * "Talk to us" under the plan cards (owner, 20 Nov 2026): a contact email
 * only, no call to book. The words are the site's.
 */
export function TalkToUs({ body, email }: { body: string; email: string }) {
    return (
        <section
            aria-labelledby="talk-title"
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[18px] border border-border bg-card px-5 py-[22px] min-[760px]:px-6"
        >
            <div className="min-w-[240px] flex-1">
                <h3
                    id="talk-title"
                    className="m-0 text-[17px] font-semibold leading-normal"
                >
                    Talk to us
                </h3>
                <p className="m-0 mt-0.5 text-[15px] text-mk-copy">{body}</p>
            </div>
            <TextLink
                href={`mailto:${email}`}
                tone="ink"
                className="text-[15px]"
            >
                {email}
            </TextLink>
        </section>
    );
}
