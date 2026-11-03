/** Shows every [confirm …] in a text as what it is: not a claim yet. */
export function Marked({ text }: { text: string }) {
    return text.split(/(\[confirm[^\]]*\])/).map((part, i) =>
        i % 2 ? (
            <mark
                key={i}
                className="rounded bg-[#F7E8D2] px-1 font-medium text-saffron-text"
            >
                {part}
            </mark>
        ) : (
            part
        ),
    );
}
