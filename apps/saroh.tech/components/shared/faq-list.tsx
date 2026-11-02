export interface Faq {
    question: string;
    answer: string;
}

/** The questions, closed: a real disclosure that needs no JavaScript. */
export function FaqList({ items }: { items: readonly Faq[] }) {
    return (
        <div className="border-b border-line">
            {items.map((item) => (
                <details
                    key={item.question}
                    className="group border-t border-line"
                >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                        {item.question}
                        <span aria-hidden="true" className="group-open:hidden">
                            +
                        </span>
                        <span
                            aria-hidden="true"
                            className="hidden group-open:inline"
                        >
                            −
                        </span>
                    </summary>
                    <p className="m-0 pb-5 text-[15.5px] leading-normal text-body">
                        {item.answer}
                    </p>
                </details>
            ))}
        </div>
    );
}
