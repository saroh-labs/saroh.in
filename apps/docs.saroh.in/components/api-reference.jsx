import { Code, Pre, Table } from "nextra/components";

import v1 from "../public/api/v1.json";

// The API's address is read from the OpenAPI file, which `pnpm openapi`
// writes for one edition (packages/api-contract/scripts/openapi.ts). So the
// guides, the reference and the downloads always name the same host, and a
// Global copy of the docs changes only that script's edition.
const api = new URL(v1.servers[0].url);

/** `https://api.<edition>`, with no path. */
export const API_URL = api.origin;

/** The edition's own site, whose help and pages the footer links. */
export const SITE_URL = `https://${api.host.replace(/^api\./, "")}`;

/** The MCP address AI apps connect to: `https://mcp.<edition>/mcp`. */
export const MCP_URL = `https://${api.host.replace(/^api\./, "mcp.")}/mcp`;

/**
 * The API reference, drawn from an OpenAPI document `pnpm openapi` wrote
 * from @saroh/api-contract. Nothing here is typed by hand, so the page
 * can't drift from the contract; `pnpm check:openapi` keeps the file in
 * step with it.
 */

const slug = (text) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

/** The schema a nullable field wraps, or the schema itself. */
function unwrap(schema) {
    const options = schema?.anyOf?.filter((s) => s.type !== "null");
    return options?.length === 1 ? options[0] : schema;
}

function typeOf(schema) {
    if (!schema) return "any";
    if (schema.anyOf) return schema.anyOf.map(typeOf).join(" or ");
    if (schema.enum)
        return schema.enum.map((v) => JSON.stringify(v)).join(" | ");
    if (schema.const !== undefined) return JSON.stringify(schema.const);
    const type = Array.isArray(schema.type)
        ? schema.type.join(" or ")
        : schema.type;
    if (type === "array") return `array of ${typeOf(schema.items)}`;
    if (schema.format) return `${type} (${schema.format})`;
    return type ?? "any";
}

/** One row per field, nested fields as `a.b` and list items as `a[].b`. */
function fieldRows(schema, prefix = "") {
    const required = new Set(schema?.required ?? []);
    return Object.entries(schema?.properties ?? {}).flatMap(([key, field]) => {
        const name = `${prefix}${key}`;
        const inner = unwrap(field);
        const row = {
            name,
            type: typeOf(field),
            required: required.has(key),
            description: field.description ?? inner?.description ?? "",
        };
        if (inner?.type === "object") {
            return [row, ...fieldRows(inner, `${name}.`)];
        }
        if (inner?.type === "array" && unwrap(inner.items)?.type === "object") {
            return [row, ...fieldRows(unwrap(inner.items), `${name}[].`)];
        }
        return [row];
    });
}

function Fields({ rows, showRequired = true }) {
    if (rows.length === 0) return null;
    return (
        <Table>
            <thead>
                <Table.Tr>
                    <Table.Th>Field</Table.Th>
                    <Table.Th>Type</Table.Th>
                    {showRequired ? <Table.Th>Required</Table.Th> : null}
                    <Table.Th>Notes</Table.Th>
                </Table.Tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <Table.Tr key={row.name}>
                        <Table.Td>
                            <code>{row.name}</code>
                        </Table.Td>
                        <Table.Td>{row.type}</Table.Td>
                        {showRequired ? (
                            <Table.Td>{row.required ? "Yes" : "No"}</Table.Td>
                        ) : null}
                        <Table.Td>{row.description}</Table.Td>
                    </Table.Tr>
                ))}
            </tbody>
        </Table>
    );
}

const PLACES = { path: "Path", query: "Query", header: "Header" };

function Operation({ base, path, method, op }) {
    const params = (op.parameters ?? []).map((p) => ({
        name: p.name,
        type: `${PLACES[p.in] ?? p.in} · ${typeOf(p.schema)}`,
        required: p.required,
        description: p.description ?? p.schema?.description ?? "",
    }));
    const body = op.requestBody?.content?.["application/json"]?.schema;
    const [okStatus, ok] =
        Object.entries(op.responses).find(([status]) => /^2/.test(status)) ??
        [];
    const okSchema = ok?.content?.["application/json"]?.schema;
    const refusals = Object.entries(op.responses).filter(([status]) =>
        /^[45]/.test(status),
    );
    const id = slug(`${method} ${path}`);
    return (
        <section>
            <h3 id={id}>
                <a href={`#${id}`}>{op.summary}</a>
            </h3>
            <Pre data-copy="">
                <Code>{`${method.toUpperCase()} ${base}${path}`}</Code>
            </Pre>
            <p>
                {op["x-saroh-capability"] ? (
                    <>
                        Needs <code>{op["x-saroh-capability"]}</code>.
                    </>
                ) : (
                    "Any key on this surface may call it."
                )}
            </p>
            {params.length ? (
                <>
                    <h4>Parameters</h4>
                    <Fields rows={params} />
                </>
            ) : null}
            {body ? (
                <>
                    <h4>Request body</h4>
                    <Fields rows={fieldRows(unwrap(body))} />
                </>
            ) : null}
            {okSchema ? (
                <>
                    <h4>
                        Answer: {okStatus} {ok.description}
                    </h4>
                    <Fields
                        rows={fieldRows(unwrap(okSchema))}
                        showRequired={false}
                    />
                </>
            ) : null}
            <h4>Refusals</h4>
            <ul>
                {refusals.map(([status, r]) => (
                    <li key={status}>
                        <strong>{status}</strong>: {r.description}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function ApiReference({ spec }) {
    const base = spec.servers?.[0]?.url ?? "";
    const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
        Object.entries(item).map(([method, op]) => ({ path, method, op })),
    );
    return (
        <>
            {spec.tags.map(({ name }) => (
                <section key={name}>
                    <h2 id={slug(name)}>
                        <a href={`#${slug(name)}`}>{name}</a>
                    </h2>
                    {operations
                        .filter(({ op }) => op.tags.includes(name))
                        .map(({ path, method, op }) => (
                            <Operation
                                key={`${method} ${path}`}
                                base={base}
                                path={path}
                                method={method}
                                op={op}
                            />
                        ))}
                </section>
            ))}
        </>
    );
}

/** A code sample that names the API's address, which a fenced block can't. */
export function Sample({ children }) {
    return (
        <Pre data-copy="">
            <Code>{children}</Code>
        </Pre>
    );
}
