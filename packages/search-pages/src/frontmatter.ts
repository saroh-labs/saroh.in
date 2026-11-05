import { parse as parseYaml } from "yaml";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** A file's frontmatter checked against `schema` (its slug must be the file's name), and the body under it. */
export function splitFile<T extends { slug: string }>(
    file: string,
    source: string,
    schema: {
        safeParse: (v: unknown) =>
            | { success: true; data: T }
            | {
                  success: false;
                  error: {
                      issues: { path: PropertyKey[]; message: string }[];
                  };
              };
    },
): { data: T; body: string; bodyLine: number } {
    const match = FENCE.exec(source);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const parsed = schema.safeParse(parseYaml(match[1] ?? ""));
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (i) =>
                `  ${i.path.map(String).join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(`${file}: frontmatter is wrong\n${lines.join("\n")}`);
    }
    const name = file.replace(/^.*\//, "").replace(/\.mdx$/, "");
    if (parsed.data.slug !== name)
        throw new Error(`${file}: slug says ${parsed.data.slug}`);
    return {
        data: parsed.data,
        body: source.slice(match[0].length),
        bodyLine: match[0].split("\n").length,
    };
}
