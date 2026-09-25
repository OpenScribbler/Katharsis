---
title: Provenance
description: How every item Katharsis ships is signed and attested through MOAT.
---

This repo is a self-publishing [MOAT](https://openscribbler.github.io/moat/) registry, and every
item it ships is `Dual-Attested`, MOAT's highest trust tier. On every push to `main`, one workflow
hashes the setup skill, the output styles, and the guidance files, signs each hash with Sigstore,
and records it in the Rekor public transparency log. A second workflow verifies those entries,
signs the same hashes under its own identity, and publishes a signed registry manifest.

The repo holds no signing keys. [SECURITY.md](https://github.com/OpenScribbler/Katharsis/blob/main/SECURITY.md#moat-attestation) says what the
attestations cover, what they leave out, and how to run the checks yourself.
