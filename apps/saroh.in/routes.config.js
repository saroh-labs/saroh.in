const fs = require("node:fs");
const path = require("node:path");

/**
 * Every page route under `app/`, as an address pattern: route groups
 * dropped, dynamic segments kept (`/changelog/[slug]`). Read once, when
 * `next.config.js` loads at build (or `next dev` start), and inlined as
 * `SAROH_BUILT_ROUTES`, so the running site knows which pages it has
 * without reading a file system it may not have.
 *
 * @param {string} [root] the `app` directory
 * @returns {string[]}
 */
function builtRoutes(root = path.join(__dirname, "app")) {
    /** @type {string[]} */
    const found = [];
    /** @param {string} dir @param {string[]} segments */
    const walk = (dir, segments) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                // `_private` folders and `@slots` are not addresses.
                if (/^[_@]/.test(entry.name)) continue;
                const group = /^\(.*\)$/.test(entry.name);
                walk(
                    path.join(dir, entry.name),
                    group ? segments : [...segments, entry.name],
                );
            } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) {
                found.push(`/${segments.join("/")}`);
            }
        }
    };
    walk(root, []);
    return [...new Set(found)].sort();
}

module.exports = { builtRoutes };
