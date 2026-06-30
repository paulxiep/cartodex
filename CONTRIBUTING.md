# Contributing to Cartodex

Thanks for your interest in cartodex. Issues, discussion, and well-scoped
PRs are welcome. See the [README](README.md) for the current state and
roadmap.

## License

cartodex is released under the [GNU Affero General Public License v3.0](LICENSE).
If the `engine/` is published as a standalone package, it carries the same
license.

## Contributor License Agreement

Before any contribution can be merged, you must sign one of the
following:

- [`CLA-individual.md`](CLA-individual.md), if you are contributing on
  your own behalf.
- [`CLA-corporate.md`](CLA-corporate.md), if you are contributing as an
  employee or on behalf of a corporation. Your employer should sign this
  and list you as a Designated Employee.

The CLA is a **License Grant**: you keep your copyright, but you give the
project a perpetual, sublicensable license to your contribution. This is
the standard pattern for single-sponsor open-source projects, and it
lets the project evolve its licensing if circumstances ever require it.
cartodex currently ships under AGPL-3.0.

If signing a CLA is a hard "no" for you on principle, that's understood,
and you remain welcome to fork, file issues, and discuss the project. We
can't merge un-CLA'd contributions, but the conversation is still
valuable.

### How to sign

Open your PR as usual. A bot (CLA Assistant Lite) will check whether
you've signed and, if not, comment with a link to the CLA. To sign the
individual CLA, post this comment on the PR:

> I have read the CLA Document and I hereby sign the CLA

Your signature is recorded in this repo on the `cla-signatures` branch.
Corporate contributions use `CLA-corporate.md`; contact the maintainer to
arrange the corporate signature, since the bot gates the individual CLA
only.

### Third-party code in contributions

If your contribution includes any code that you did not author yourself
(for example, vendored dependencies, ported code from another open-source
project, or AI-generated code that may carry obligations from its training
data), call this out explicitly in the PR description:

- Identify the original source, its license, and its copyright holders.
- Confirm the original license is compatible with AGPL-3.0.
- Preserve the original copyright and license notices in the contributed
  files.

If you're unsure whether your contribution includes third-party content,
ask in the PR or open an issue first. We'd rather sort this out before
merge than after.

## Filing issues

- **Bugs**: include the view and layers you were rendering, the dataset
  involved, and the actual vs expected behavior. A screenshot of the map
  helps.
- **Data issues**: specify the dataset (for example World Bank population
  or OpenFlights) and the affected geometry ids.
- **Design questions**: prefer GitHub Discussions over Issues if the
  question doesn't have a clear actionable outcome.

## Opening a PR

1. Fork the repo and create a feature branch from `main`.
2. Make your change. Keep PRs scoped: one logical change per PR is easier
   to review than a sprawling cleanup.
3. Run the checks locally:
   - Typecheck: `pnpm typecheck`
   - Lint: `pnpm lint`
   - Build: `pnpm build`
4. Sign the CLA (see above) if you haven't already.
5. Open a PR against `main`. Describe what changed and why.

## Code style

- TypeScript (strict), matched to the existing style of `src/`.
- ESLint via `typescript-eslint`; `pnpm lint` must pass.
- Keep the engine and app boundary intact: `engine/` stays reusable and
  free of datasets or page chrome; `app/` consumes it.

## Scope

cartodex has a specific thesis: views and layers are two orthogonal axes
over one typed engine, so a new map is a new *view* or a new *dataset*,
not a new bespoke page. Contributions that strengthen that structure are
higher priority than one-off additions. Before opening a large PR,
consider opening an Issue first to align on scope. See the
[README architecture section](README.md#architecture) for the model.

## Conduct

Be respectful and assume good faith. We don't have a formal Code of
Conduct yet; the operating norm is "act like an adult."

## Questions

Open an Issue or start a Discussion on GitHub.
