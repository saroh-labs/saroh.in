import { CardLink } from "../links/card-link";
import { Section } from "./section";

/** Home's `#solutions`: the title and a large card for each solution page. */
export function SolutionCards({
    title,
    items,
}: {
    title: string;
    items: readonly {
        href: string;
        title: string;
        body: string;
        meta: string;
        action: string;
    }[];
}) {
    return (
        <Section
            id="solutions"
            titleId="solutions-title"
            title={title}
            className="grid scroll-mt-6 gap-[18px] pt-[110px]"
        >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
                {items.map((s) => (
                    <CardLink
                        key={s.href}
                        href={s.href}
                        title={s.title}
                        body={s.body}
                        meta={s.meta}
                        action={s.action}
                        size="lg"
                    />
                ))}
            </div>
        </Section>
    );
}
