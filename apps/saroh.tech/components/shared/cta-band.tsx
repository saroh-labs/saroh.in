import { ButtonLink } from "./button";

/** The closing band: the page's one next step again, with why it costs nothing to try. */
export function CtaBand({
    title,
    line,
    action,
    href,
    from,
}: {
    title: string;
    line: string;
    action: string;
    href: string;
    /** What PostHog calls this click. */
    from: string;
}) {
    return (
        <section className="flex flex-col gap-5 rounded-[18px] bg-ink p-7 text-paper md:flex-row md:items-center md:justify-between md:p-12">
            <div className="flex flex-col gap-2">
                <h2 className="m-0 font-display text-[28px] font-bold leading-[1.05] tracking-[-0.04em] md:text-[40px]">
                    {title}
                </h2>
                <p className="m-0 text-base leading-normal text-[#D9D4C8]">
                    {line}
                </p>
            </div>
            <ButtonLink
                href={href}
                data-cta={from}
                className="shrink-0 !bg-paper !text-ink hover:!bg-white"
            >
                {action}
            </ButtonLink>
        </section>
    );
}
