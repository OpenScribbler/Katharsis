---
title: Provenance
description: How Katharsis signs and attests the files it ships.
---

Katharsis is a self-publishing [MOAT](https://openscribbler.github.io/moat/) registry.
Every item it ships is `Dual-Attested`, MOAT's highest trust tier.

On each push to `main`, one workflow signs the hash of each shipped file with Sigstore and records it in the Rekor
transparency log.
A second workflow verifies those entries, signs them under its own identity, and publishes a signed registry manifest.
The repository holds no signing keys.

[SECURITY.md](https://github.com/OpenScribbler/Katharsis/blob/main/SECURITY.md#moat-attestation) describes what the attestations cover and how to verify them.
