import { LinkCard } from "./card";

export function RelatedGrid({
    title,
    items,
}: {
    title: string;
    items: readonly { title: string; line: string; href: string }[];
}) {
    return (
        <section className="flex flex-col gap-4">
            <h2 className="m-0 font-display text-mk-h2-sm font-bold [text-wrap:balance]">
                {title}
            </h2>
            <div className="grid gap-3 md:grid-cols-3 md:gap-6">
                {items.map((item) => (
                    <LinkCard key={item.href} {...item} />
                ))}
            </div>
        </section>
    );
}
