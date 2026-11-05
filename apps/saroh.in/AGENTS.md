<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Search pages carry only what is live

A production build holds only live search pages' words and tools' code
(DEC-193 amendment, 1 Nov; DEC-201). `docs-content.config.ts` writes
`lib/docs-content.gen.ts`, `lib/search-content.gen.ts` and
`lib/tool-registry.gen.ts` (git-ignored) from the publish list before
`next dev` and `next build`. Read /for/ pages and tools through
`searchPages` (`lib/search-pages.ts`) and draw a tool with `SiteToolSlot`;
never import `@saroh/search-pages/embedded`, `./docs-embedded` or `./tools`
(admin's, every draft). `client-bundle.test.ts` and
`pnpm check:draft-words` hold it.
