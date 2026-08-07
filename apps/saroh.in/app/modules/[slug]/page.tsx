import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductShot } from "@/components/site/product-shot";
import { LABEL_BY_KEY, MODULES, MODULE_BY_SLUG } from "@/lib/modules";

/** All eight are known at build time, so every module page is static. */
export function generateStaticParams() {
    return MODULES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const m = MODULE_BY_SLUG.get(slug);
    if (!m) return {};
    return {
        title: `${m.label} — Saroh`,
        description: m.lede,
        openGraph: { title: `${m.label} — Saroh`, description: m.lede },
    };
}

export default async function ModulePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const m = MODULE_BY_SLUG.get(slug);
    if (!m) notFound();

    // Modules that list this one as a dependency — the other half of the
    // relationship, which is what makes CRM's page worth reading.
    const requiredBy = MODULES.filter((o) => o.needs?.includes(m.key));

    return (
        <>
            <section className="border-b border-border py-24">
                <div className="mx-auto max-w-6xl px-6">
                    <Link
                        href="/modules"
                        className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        ← Modules
                    </Link>

                    <h1 className="mt-5 font-display text-[clamp(2.125rem,4.4vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.035em]">
                        {m.label}
                    </h1>
                    <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">
                        {m.lede}
                    </p>

                    {m.needs?.length ? (
                        /* The workspace already has one recipe for a tinted
                           brand chip — `border-brand/30 bg-brand-subtle
                           text-brand-subtle-foreground`, used by every status
                           badge in the product. This pill was mixing its own
                           (`bg-brand/10 text-brand`), which lands close enough
                           to look intentional and then drifts the moment the
                           subtle tokens are retuned. Same two surfaces, one
                           recipe. */
                        <p className="mt-6 inline-flex items-center rounded-md border border-brand/30 bg-brand-subtle px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-brand-subtle-foreground">
                            Requires{" "}
                            {m.needs
                                .map((k) => LABEL_BY_KEY.get(k) ?? k)
                                .join(" · ")}
                        </p>
                    ) : null}

                    <div className="mt-8 flex flex-wrap items-center gap-2.5">
                        <Link
                            href="https://accounts.saroh.in/signup"
                            className="inline-flex h-[38px] items-center rounded-md bg-primary px-[18px] text-[13.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Start free
                        </Link>
                        <Link
                            href="/#waitlist"
                            className="inline-flex h-[38px] items-center rounded-md border border-border px-[18px] text-[13.5px] font-medium transition-colors hover:bg-accent"
                        >
                            Join the waitlist
                        </Link>
                    </div>

                    {m.shot ? (
                        <ProductShot
                            name={m.shot.src
                                .replace("/product/", "")
                                .replace(".png", "")}
                            alt={m.shot.alt}
                            caption={m.shot.caption}
                            priority
                        />
                    ) : null}
                </div>
            </section>

            <section className="py-24">
                <div className="mx-auto grid max-w-6xl gap-14 px-6 md:grid-cols-2">
                    <div>
                        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                            What&rsquo;s inside
                        </h2>
                        <ul className="mt-6 border-t border-border">
                            {m.inside.map((item) => (
                                <li
                                    key={item}
                                    className="border-b border-border py-3.5 text-[15px]"
                                >
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                            How it connects
                        </h2>
                        <div className="mt-6 grid gap-4 text-[15px] leading-relaxed text-muted-foreground">
                            {m.needs?.length ? (
                                <p>
                                    Switching {m.label} on also switches on{" "}
                                    {m.needs
                                        .map((k) => LABEL_BY_KEY.get(k) ?? k)
                                        .join(" and ")}
                                    , because its work has to belong to
                                    somebody. The product enforces this — it is
                                    not a suggestion.
                                </p>
                            ) : (
                                <p>
                                    {m.label} stands on its own. Nothing else
                                    has to be switched on first.
                                </p>
                            )}

                            {requiredBy.length ? (
                                <p>
                                    {requiredBy.length === 1
                                        ? `${requiredBy[0].label} requires ${m.label}.`
                                        : `${requiredBy
                                              .map((r) => r.label)
                                              .join(
                                                  ", ",
                                              )} all require ${m.label}.`}
                                </p>
                            ) : null}

                            <p>
                                Turning {m.label} off stops new activity but
                                never deletes what it held. Turn it back on and
                                the workspace is there.
                            </p>
                        </div>

                        <div className="mt-8 border-t border-border pt-6">
                            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
                                Other modules
                            </h2>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {MODULES.filter((o) => o.key !== m.key).map(
                                    (o) => (
                                        <Link
                                            key={o.key}
                                            href={`/modules/${o.slug}`}
                                            className="inline-flex h-[30px] items-center rounded-md border border-border px-3 text-[13px] transition-colors hover:bg-accent"
                                        >
                                            {o.label}
                                        </Link>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
