import { CardLink } from "../links/card-link";
import { TextLink } from "../links/text-link";
import { Section } from "../sections/section";

/**
 * The landing's free tools, the same section on both sites (owner, 16 Nov
 * 2026, bug #15): a heading, a line, the site's own top tools as cards and
 * the link to all of them. Free tools are how people find Saroh.
 */
export function HomeTools({
    title,
    lead,
    tools,
    all,
}: {
    title: string;
    lead: string;
    /** `desk`: shown from 768px only, so a phone keeps the list short. */
    tools: readonly {
        title: string;
        line: string;
        href: string;
        desk?: boolean;
    }[];
    all: { name: string; href: string };
}) {
    return (
        <Section
            id="tools"
            titleId="tools-title"
            title={title}
            lead={lead}
            size="kit-h2"
            className="grid scroll-mt-24 gap-6 pt-12 min-[760px]:pt-[72px]"
        >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
                {tools.map((tool) => (
                    <CardLink
                        key={tool.href}
                        href={tool.href}
                        prefetch={false}
                        title={tool.title}
                        body={tool.line}
                        className={tool.desk ? "hidden md:grid" : undefined}
                    />
                ))}
            </div>
            <TextLink
                href={all.href}
                tone="ink"
                arrow
                className="justify-self-start text-[15px]"
            >
                {all.name}
            </TextLink>
        </Section>
    );
}
