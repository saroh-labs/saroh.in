// A work branch starts from development, never from main.
// Main holds each release's merge commit, which development never has (work
// goes development → main only). A unit cut from main carried one of those
// into development on 16 Oct (#972), main and development then had two merge
// bases, and GitHub called the next release PR (#976) conflicting when it
// wasn't. So a branch is refused if it holds a commit main has and
// development doesn't. Read from the local remote refs; skipped where they
// are missing (a fresh clone, CI) and on main and development themselves.
import { execFileSync } from "node:child_process";

const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function tryGit(...args) {
    try {
        return git(...args);
    } catch {
        return null;
    }
}

const branch = tryGit("rev-parse", "--abbrev-ref", "HEAD");
if (branch === "main" || branch === "development") {
    console.log(`branch-base: on ${branch}, nothing to check`);
    process.exit(0);
}
if (!tryGit("rev-parse", "--verify", "--quiet", "origin/main") || !tryGit("rev-parse", "--verify", "--quiet", "origin/development")) {
    console.log("branch-base: origin/main or origin/development not fetched, skipped");
    process.exit(0);
}

// A release branch (development with main merged in) is the one exception.
if (branch?.startsWith("release-")) {
    console.log(`branch-base: ${branch} is a release branch, skipped`);
    process.exit(0);
}

const mainOnly = (tryGit("rev-list", "origin/main", "^origin/development") ?? "")
    .split("\n")
    .filter(Boolean);
const leaked = mainOnly.filter(
    (commit) => tryGit("merge-base", "--is-ancestor", commit, "HEAD") !== null,
);

if (leaked.length > 0) {
    const shown = leaked
        .slice(0, 3)
        .map((c) => `  ${tryGit("log", "-1", "--format=%h %s", c)}`)
        .join("\n");
    console.error(
        `branch-base: this branch holds ${leaked.length} commit(s) from main that development doesn't have:\n${shown}\n` +
            "Work branches start from development (or a batch made from it), never from main. " +
            "Make the branch again from the batch and move your commits onto it.",
    );
    process.exit(1);
}
console.log(`branch-base: no main-only commits (${mainOnly.length} on main checked)`);
