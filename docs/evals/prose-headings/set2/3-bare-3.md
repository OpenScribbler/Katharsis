A quickstart teaches the system; an integration guide serves an environment.

In a quickstart the environment is a vehicle. The author picks one, commits to it, and the reader follows a single path to first success. The reader does not choose, because choosing is the thing they cannot yet do. In an integration guide the environment is the subject. The reader arrives already knowing they run on Cloud Run, and the guide meets them there with the attestation mechanism, the deployment mechanics, and the platform's gotchas. Success moves from "it worked once" to "it runs in production."

Aembit's existing quickstart already settles which of those TICKET-1 is. `api-guide/edge/quickstart-edge.mdx` runs 4,726 words across three steps, picks GitHub and GitLab CI as its one path, and closes with "Common errors and solutions." It commits to an environment rather than abstracting over them.

That is the part I had not worked through. If the SDK quickstart follows that pattern, it picks an environment — and every environment the SDK supports already has a verified example. `ts/examples/` now holds ten, including `k8s-service-account`, `gitlab-ci-oidc`, and `terraform-cloud-oidc`, three more than when I looked earlier in this thread. The quickstart's code would then be a transcription of one of them, exactly like the shipped integration guides already are, and the snippet scaffold would have nothing left to cover.

The scaffold earns its place only if the quickstart is deliberately environment-agnostic — a shortest-possible illustration that runs nowhere in particular.

## Errata

E1 - **my Q1 recommendation rested on "Quickstart has no upstream example"** - that premise holds only when the quickstart abstracts over environments, and the existing Edge API quickstart does not.

## Questions

❓ **Q2** - **Does the Edge SDK quickstart pick one environment or abstract over them?**
   a. Picks one, matching `quickstart-edge.mdx`. Its code becomes a transcription of an existing verified example, and the snippet scaffold goes away.
   b. Abstracts over them, with a minimal illustration that runs nowhere in particular. The scaffold then covers code nothing upstream owns.

➡️ a — a reader who finishes a quickstart should have something running, and code that runs nowhere gives them no first success to have.
