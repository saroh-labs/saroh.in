/**
 * The cookie notice a merchant's site links its banner to when the merchant
 * has no privacy page of their own (DEC-108): which tools the site uses and
 * what each does, in the site's own look. Written by Saroh, said plainly,
 * and true for this site only: it lists exactly the tools that run.
 */
export function CookieNotice({
    siteName,
    tools,
}: {
    siteName: string;
    tools: readonly { name: string; purpose: string; asks: boolean }[];
}) {
    const asking = tools.some((t) => t.asks);
    return (
        <main className="bg-site-bg text-site-fg font-site-body mx-auto max-w-[720px] px-5 py-14">
            <h1 className="font-site-heading text-[28px] font-semibold tracking-[-0.03em]">
                Cookies and visitor counting
            </h1>
            {tools.length === 0 ? (
                <p className="mt-4 text-[16px] leading-relaxed">
                    {siteName} uses no analytics or advertising tools on this
                    site.
                </p>
            ) : (
                <>
                    <p className="mt-4 text-[16px] leading-relaxed">
                        {siteName} uses these tools on this site. They never run
                        on checkout, payment or account pages, and what you type
                        into a form is hidden from them.
                    </p>
                    <ul className="border-site-border mt-6 divide-y border-y">
                        {tools.map((t) => (
                            <li key={t.name} className="py-4">
                                <p className="font-semibold">{t.name}</p>
                                <p className="text-site-muted mt-1 text-[15px] leading-relaxed">
                                    {t.purpose}
                                    {t.asks
                                        ? " Runs only if you accept."
                                        : null}
                                </p>
                            </li>
                        ))}
                    </ul>
                    {asking ? (
                        <p className="mt-6 text-[15px] leading-relaxed">
                            You can change your answer at any time with
                            &ldquo;Cookie choices&rdquo; at the foot of every
                            page. Your answer is kept in this browser only.
                        </p>
                    ) : null}
                    <p className="text-site-muted mt-6 text-[14px] leading-relaxed">
                        {siteName} chose these tools and decides what is done
                        with what they collect. Ask {siteName} about your data.
                    </p>
                </>
            )}
        </main>
    );
}
