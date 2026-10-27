# Research basis and design comparison

Read this only when maintaining or evaluating this skill.

## Options compared

| Shape | Strength | Main weakness | Decision |
| --- | --- | --- | --- |
| One large always-loaded full-stack prompt | Centralizes every rule | Consumes context, overconstrains small tasks, and becomes stale or contradictory | Rejected |
| Separate frontend, backend, database, QA, UX, and user-role skills | Precise specialist triggers | Cross-layer features can load conflicting processes and lose one product outcome | Rejected for this repository |
| Thin project router with focused references | One outcome and trigger, with detail loaded only when relevant | Requires clear routing and maintained references | Chosen |

This design treats “senior” as decision quality and evidence, not a persona claim or a demand for maximum architecture. It favors user outcomes, vertical slices, explicit boundaries, proportional verification, and deletion of unjustified complexity.

## Skill-authoring evidence

- OpenAI's [Skills overview](https://developers.openai.com/plugins/concepts/skills) says discovery starts from the name and description and the full instructions load only on a match.
- OpenAI's [guidance on skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) recommends concise trigger descriptions and progressive disclosure instead of large procedural prompts.
- OpenAI's [systematic skill evaluation guide](https://developers.openai.com/blog/eval-skills) recommends testing explicit, implicit, contextual, and negative-control prompts because invocation quality depends heavily on metadata.

## Engineering evidence

- [GOV.UK Government Design Principles](https://www.gov.uk/guidance/government-design-principles) supports starting from user needs, doing less, making complex services simple, iterating, and designing inclusively.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) is the accessibility target already named by SproutSync's product requirements.
- [OWASP ASVS](https://asvs.owasp.org/) provides testable web-application security requirements.
- [NIST SSDF SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) organizes secure development practices across the software lifecycle.

## Invocation expectations

The skill should activate for SproutSync feature implementation, product defects, UX flow changes, API or schema work, engineering reviews, and release-quality validation. It should not activate for a typo-only documentation edit, general conversation, or administration unrelated to the product.

When evolving the skill, test at least one direct invocation, one normal SproutSync feature request, one noisy cross-layer request, and one negative control. Prefer changing a narrow instruction supported by an observed failure over adding broad preventive rules.
