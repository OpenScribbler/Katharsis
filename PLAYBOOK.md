# Playbook

Refactorings that cleared a Smell in this repo, each with when it applies and its limits. Codie's Gate points agents here; add an entry with `codie playbook add` after a refactoring clears a Smell.

## Brain Method

- **Refactoring:** Moved each section of a long event handler into a module-level function that returns its lines, taking a small per-turn context object, and left the handler as the ordered calls
- **Applies when:** A hook handler that builds one output from independent sections, each with its own state reads and fallbacks
- **Limits:** The Claude Code hooks engine rejects $ inside an object or reached as t.$; pass $ as its own first parameter named $

## Brain Method

- **Refactoring:** Split a register function that installs many hooks into one function per hook at the hook boundaries, then moved each render handler JSX block and its layout math into module-level functions taking $, the resolved components, and a small fit object
- **Applies when:** A Claude Code mod module whose register function holds every hook inline, or a render handler that draws several independent regions
- **Limits:** A helper that needs $ takes it as its first argument, never inside an object; JSX regions that read shared module state stay correct only because state lives in the module-level S, not in handler locals

## Large Method

- **Refactoring:** Wrapped runs of related tests in nested describe blocks inside the outer describe, so the shared helpers stay in scope and each describe body stays short
- **Applies when:** A test file whose describe callback is flagged Large Method for holding many test() calls
- **Limits:** Re-indenting moves lines inside multi-line template literals, so check none span the moved range first

## Large Method

- **Refactoring:** Wrapped a shell test suite top level into functions of about 60 lines, cutting only at blank lines where bash -n on the prefix parses with no warning, then called them in order
- **Applies when:** A bash test file whose top level is flagged Large or Complex Method for holding many check calls with heredoc fixtures
- **Limits:** bash -n returns 0 on an unterminated heredoc and only warns, so a cut must also require empty stderr; verify the diff adds lines only and the pass count is unchanged

## Brain Method

- **Refactoring:** Turned a CLI run function made of closures over shared locals into a class whose fields hold the shared state and whose methods are the former closures, with a small base class for the output helpers needed before argument parsing succeeds
- **Applies when:** A long entry-point function whose inner closures all read the same parsed flags, context, and loaded indexes
- **Limits:** Node type stripping rejects TypeScript parameter properties, so constructors assign fields explicitly; pass methods as arrow wrappers, never bare, so this stays bound
