---
title: Provenance
description: Which Katharsis files are signed and attested, and how to verify them.
---

Katharsis publishes signed attestations through [MOAT](https://openscribbler.github.io/moat/).
Three items are attested:

| Item | Path | Contents |
|---|---|---|
| `setup` | `skills/setup/` | The setup skill |
| `katharsis-output-style` | `output-styles/` | The two output style files |
| `katharsis-styles` | `styles/` | Every file under `styles/`: the guidance files, their shared rules, and the model notes |

The hooks, scripts, and `kref` aren't attested.

On each push to `main`, one workflow hashes each item, signs the hash with Sigstore, and records it in the Rekor
transparency log.
A second workflow verifies those entries, signs them under its own identity, and publishes a signed registry manifest.
Two independent signatures give each item MOAT's `Dual-Attested` tier.
The repository holds no signing keys.

[SECURITY.md](https://github.com/OpenScribbler/Katharsis/blob/main/SECURITY.md#moat-attestation) describes how to
verify an item.
