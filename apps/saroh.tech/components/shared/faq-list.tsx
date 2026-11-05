import { FaqItems } from "@saroh/marketing/faq";

export interface Faq {
    question: string;
    answer: string;
}

export function FaqList({ items }: { items: readonly Faq[] }) {
    return (
        <FaqItems items={items.map((i) => ({ q: i.question, a: i.answer }))} />
    );
}
