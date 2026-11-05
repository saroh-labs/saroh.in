import { Container } from "../layout/container";
import { PillLink } from "../links/pill";
import { Eyebrow } from "./eyebrow";

/** Home's "Works for" row: a chip for each solution page. */
export function WorksFor({
    label,
    items,
    prefetch,
}: {
    label: string;
    items: readonly { href: string; name: string }[];
    prefetch?: boolean;
}) {
    return (
        <Container
            as="nav"
            aria-label={label}
            className="flex flex-wrap items-center gap-3.5 pt-24"
        >
            <Eyebrow>{label}</Eyebrow>
            {items.map((s) => (
                <PillLink key={s.href} href={s.href} prefetch={prefetch}>
                    {s.name}
                </PillLink>
            ))}
        </Container>
    );
}
