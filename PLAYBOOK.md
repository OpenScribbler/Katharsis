# Playbook

Refactorings that cleared a Smell in this repo, each with when it applies and its limits. Codie's Gate points agents here; add an entry with `codie playbook add` after a refactoring clears a Smell.

## Brain Method

- **Refactoring:** Moved each section of a long event handler into a module-level function that returns its lines, taking a small per-turn context object, and left the handler as the ordered calls
- **Applies when:** A hook handler that builds one output from independent sections, each with its own state reads and fallbacks
- **Limits:** The Claude Code hooks engine rejects $ inside an object or reached as t.$; pass $ as its own first parameter named $
