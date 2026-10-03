/**
 * The "compare a project by prefix" rule in `eslint.config.mjs`: what it
 * catches and what it leaves alone. Run by `pnpm lint` (node --test).
 */
import { describe, it } from "node:test";

import { RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";

import config from "./eslint.config.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// The TypeScript parser the base config lints specs with, for `as` casts.
const parser = config.find((c) => c.languageOptions?.parser)?.languageOptions
    .parser;

const tester = new RuleTester({
    languageOptions: { parser, ecmaVersion: "latest", sourceType: "module" },
});

// The options as configured for specs: the last entry's, which wins.
const [, ...options] = config.findLast((c) => c.rules?.["no-restricted-syntax"])
    .rules["no-restricted-syntax"];
const PREFIX = options[0].message;
const bad = (code) => ({ code, options, errors: [{ message: PREFIX }] });
const good = (code) => ({ code, options });

tester.run(
    "no-restricted-syntax (project by prefix)",
    builtinRules.get("no-restricted-syntax"),
    {
        valid: [
            good('testInfo.project.name.startsWith("phone")'),
            good('project.name.startsWith("desk")'),
            good("project.name === other"),
            good("testInfo.project.name !== expected"),
            good('testInfo.project.name === "phone-serial"'),
            good("`${testInfo.project.name}-x` === key"),
            good("project.name === `phone${suffix}`"),
            good('["phone-serial"].includes(name)'),
            good("/^phone/.test(project.name)"),
            good('switch (kind) { case "phone": break; }'),
            good("items.includes(project)"),
        ],
        invalid: [
            bad('testInfo.project.name === "phone"'),
            bad('project.name === "phone"'),
            bad('"desk" !== project.name'),
            bad("project.name == `phone`"),
            bad('project.name === ("phone" as const)'),
            bad('name === "phone"'),
            bad('["phone"].includes(project.name)'),
            bad('["desk", "phone"].indexOf(testInfo.project.name)'),
            bad('switch (project.name) { case "phone": break; }'),
            bad("switch (testInfo.project.name) { default: }"),
            bad("/^phone$/.test(project.name)"),
            bad("/^(desk|phone)$/.exec(testInfo.project.name)"),
            bad("project.name.match(/^phone$/)"),
        ],
    },
);
