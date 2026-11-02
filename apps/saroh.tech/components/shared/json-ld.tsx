/** Structured data, with "<" escaped so a value can't close the script tag. */
export function JsonLd({ data }: { data: readonly object[] }) {
    return data.map((ld, i) => (
        <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(ld).replace(/</g, "\\u003c"),
            }}
        />
    ));
}
