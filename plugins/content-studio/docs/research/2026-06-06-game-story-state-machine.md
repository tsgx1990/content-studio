# Research — game-story (stateful choice game) structure & the winnability gate

- Date: 2026-06-06
- Topic: How a *game* story (a choice-based game with state) differs from plain branching
  interactive-fiction, and what a deterministic gate can mechanically guarantee about it.
- Method: SearXNG web search (language=en) on choice-game engines (ChoiceScript / Twine /
  Ink / Rez) and on the failure mode they all fight — softlocks / unwinnable states.

## Question

We already ship `interactive-fiction` (a pure branching node graph, gate =
`check-storygraph.mjs`: unique ids, reachable nodes, a reachable ending). What makes a
*game-story* a distinct vertical rather than a duplicate, and what can a zero-dep gate
enforce about it that the graph gate cannot?

## Key findings

1. **The thing that makes it a game is state.** Every mainstream choice-game engine adds the
   same three primitives on top of a branching tree:
   - **flags / variables** — booleans (and stats) the world remembers (ChoiceScript `*set`,
     Twine `(set:)`, Ink `VAR`).
   - **inventory / items** — a set the player accumulates (Twine inventory arrays; ChoiceScript
     item lists; the recurring "then you want an inventory" pain point that pushes authors off
     pure Twine — rez-lang.com).
   - **conditional choices** — a choice is *available* only when state satisfies a condition
     (ChoiceScript `*if`, Twine `(if:)`/`(else:)`, Ink conditional branches). "A conditional
     win-state … inventory and object handling" is the canonical demo spec (intfiction.org,
     Cloak-of-Darkness thread).
   Sources: choiceofgames.com ChoiceScript intro/advanced; videlais.com "Learning ChoiceScript
   Part 4: Variables"; retrovem.com "Variables and Conditional Logic in Twine"; pulsegeek.com
   "Ink Scripting Examples for Conditional Branches"; rez-lang.com.

2. **The dominant correctness defect is the softlock / unwinnable state**, not a broken link.
   A *softlock* = "the player has not won or lost, but cannot make progress toward the goal, and
   is thus stuck" (PCG Workshop, *Stuck in the Middle: Generating Levels without Softlocks*,
   2025). The IF/games community calls the narrative form a "walking-dead" / "zombie" /
   "Unintentionally Unwinnable" state: victory has become impossible and *it isn't readily
   apparent* (TheAlmightyGuru wiki; TV Tropes *Unintentionally Unwinnable*; Giant Bomb
   *Unwinnable State*). Classic cause: an item/flag needed later was consumed, missed, or locked
   behind a door you already closed (Tropedia *Unwinnable by Design* — the unoiled-robot door).
   Prevention is a **states + gating + recovery-paths + validation** discipline (pulsegeek.com,
   *Branch-Safe Quest Design to Prevent Softlocks*).

3. **Winnability is decidable by reachability over (scene × state)** when state is finite. If we
   restrict state to **booleans (flags) + a finite item set** (no open-ended numeric stats), the
   reachable configuration space is finite, so a breadth-first search over `(scene, state)` pairs
   terminates and can *prove*: the win is reachable, every authored scene is reachable in some
   state, and no reachable non-ending scene is a dead end. This is the same shape as academic
   "reachability games" (arxiv 2408.13369; upv.es reachability-games) reduced to the authored,
   finite case. Numeric stats would make the space unbounded — deliberately **out of scope** for
   the gate (stats can still appear as flavor, but the gate reasons only over flags + items).

## Decisions it drove

- **New vertical `game-story`**, distinct from `interactive-fiction`: a `*.game.json` adds
  declared `flags` + `items`, and choices carry `requires_flags` / `requires_items` (availability
  conditions) and `set_flags` / `add_items` / `remove_items` (effects). A scene carries an
  `outcome` (`win` / `lose` / `neutral`) marking terminal states; a game needs ≥1 `win`.
- **Gate = `scripts/check-game-story.mjs`** enforces, beyond the graph checks:
  - **referential integrity of state**: every flag/item referenced by a requirement or effect is
    declared (the state analogue of "every choice target resolves").
  - **statically unsatisfiable requirements**: a `requires_items` item that no choice ever grants,
    or a `requires_flags {id,value}` that is neither the flag's initial value nor ever set to that
    value — flagged with a precise message (a fast, sound subset of unwinnability).
  - **winnability (the headline)**: BFS over `(scene, state)` from the start state proves a `win`
    outcome is reachable.
  - **no softlock**: every *reachable* non-ending `(scene, state)` has ≥1 *available* choice
    (requirements satisfiable in that state). A reachable stuck state is a hard fail — this is the
    walking-dead defect, made mechanical.
  - **no orphan scenes**: every authored scene is reachable in some reachable state.
- **State model kept finite on purpose**: flags (bool) + items (set). The visited set is keyed by
  `scene :: canonical(flags,items)`; a safety cap aborts with an explicit "inconclusive — state
  space too large" rather than hanging (authored games are tiny; the cap only guards pathological
  input). Effects on a Set are idempotent, so self-loops that re-grant an item converge.

## Limitations

- The gate proves winnability for the **flag+item** state model only. If an author encodes
  meaningful progression in numeric stats, the gate cannot reason about it — documented as out of
  scope; `content-review` still judges pacing/quality/fairness.
- BFS is worst-case exponential in the number of independent flags/items; fine for authored
  demos, guarded by the cap. This is a floor (structural winnability), not a balance/difficulty
  judgment.

## Sources (URLs)

- https://www.choiceofgames.com/make-your-own-games/choicescript-intro/ ; .../choicescript-advanced/
- https://videlais.com/2018/08/22/learning-choicescript-part-4-using-variables/
- https://retrovem.com/2025/03/13/understanding-variables-and-conditional-logic-in-twine-5-practical-examples-for-interactive-stories/
- https://pulsegeek.com/articles/ink-scripting-examples-for-conditional-branches/
- https://pulsegeek.com/articles/branch-safe-quest-design-to-prevent-softlocks/
- https://rez-lang.com/
- https://intfiction.org/t/figuring-out-a-choice-based-demo-specification-similar-to-cloak-of-darkness/80178
- https://www.pcgworkshop.com/archive/cooper2025softlocks.pdf (Stuck in the Middle: Generating Levels without Softlocks)
- https://www.thealmightyguru.com/Wiki/index.php?title=Unwinnable_state
- https://tvtropes.org/pmwiki/pmwiki.php/Main/UnintentionallyUnwinnable ; .../Main/Unwinnable
- https://www.giantbomb.com/unwinnable-state/3015-7607/
- https://tropedia.fandom.com/wiki/Unwinnable_by_Design
- https://arxiv.org/html/2408.13369v2 (reachability games)
