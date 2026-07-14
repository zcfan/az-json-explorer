# Expand All Design

## Goal

Add an `Expand all` tree control that expands every currently expandable object and array without weakening the viewer's large-JSON safety boundaries.

Success means:

- one click expands nested containers at every depth;
- individual nodes can still be collapsed and reopened afterward;
- `Collapse all`, `Expand root`, search reveal, and `Parse as JSON` remain predictable;
- parsing and visible-row collection stay in the worker;
- the UI never receives more than 100,000 visible-row summaries.

## Performance Decision

The virtual list mounts only viewport rows, so DOM count is not the limiting factor. The expensive work is the worker's full-tree traversal, creation of display-row summaries, and structured cloning of those summaries to the UI.

A Node worker benchmark using the repository's record-shaped stress data measured:

| Records | Expanded rows | Elapsed | Response size | Additional RSS after parse |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 4,003 | 20 ms | 1.34 MiB | about 22 MiB |
| 10,000 | 40,003 | 178 ms | 13.54 MiB | about 99 MiB |
| 50,000 | 100,000, truncated | 482 ms | 34.12 MiB | about 192 MiB |
| 50,000 | 200,003, uncapped | 1.10 s | 68.44 MiB | about 413 MiB |

The RSS values are comparative Node measurements rather than exact Chrome memory figures. They still show that an uncapped operation grows linearly and can create a much larger row payload than the source JSON.

Therefore `Expand all` keeps the existing 100,000-row safety limit. When traversal reaches the limit, the existing status message continues to say that only the first 100,000 visible rows are shown.

## Rejected Approaches

### Repeated UI expansion

The UI could repeatedly collect the current rows, add every newly visible container to `expandedKeys`, and refresh until no new containers appear. This requires multiple full or partial traversals and repeatedly sends a growing path set to the worker. Its cost approaches the product of tree depth and node count, so it is rejected.

### Return every expanded path

The worker could traverse once and return both display rows and every expandable path. This avoids repeated traversal but makes the UI retain and retransmit one path per container. It duplicates state already derivable inside the worker and increases cross-thread memory pressure, so it is rejected.

## State Model

The UI owns an expansion mode plus mode-specific exceptions:

- `explicit`: a node is expanded only when its path key is in `expandedKeys`.
- `all`: every expandable node is expanded unless its path key is in `collapsedKeys`.

Only one mode is active. Starting a new parse counts the rows a fully expanded tree would produce, stopping at 5,000. Roots within that budget start in `all` mode; larger roots start in `explicit` mode with only the root expanded.

The decision uses bounded expanded-row count instead of source bytes. Source size is a poor proxy for the actual cost: a large string can render as one row, while a much smaller deeply structured document can require thousands of row summaries. Counting stops as soon as the budget is exceeded, stays in the worker, and does not clone parsed containers to the UI.

Control transitions are:

| Action | Resulting state |
| --- | --- |
| `Expand all` | mode `all`; clear `collapsedKeys` |
| `Collapse all` | mode `explicit`; clear `expandedKeys` and `collapsedKeys` |
| `Expand root` | mode `explicit`; set `expandedKeys` to the root only; clear `collapsedKeys` |
| Toggle an expanded row in `explicit` | remove it from `expandedKeys` |
| Toggle a collapsed row in `explicit` | add it to `expandedKeys` |
| Toggle an expanded row in `all` | add it to `collapsedKeys` |
| Toggle a collapsed row in `all` | remove it from `collapsedKeys` |

Clicking `Expand all` again after manual collapses resets those exceptions and expands everything again.

## Worker And Tree Model

`collect-visible-rows` gains these request fields:

- `expansionMode`: `explicit` or `all`;
- `expandedKeys`: used in `explicit` mode;
- `collapsedKeys`: used in `all` mode.

`collectVisibleRows` receives the same expansion state. Row creation determines `expanded` as follows:

- the row must first contain a non-empty object or array;
- in `explicit` mode, its path key must be present in `expandedKeys`;
- in `all` mode, its path key must not be present in `collapsedKeys`.

The traversal, row summarization, `yieldEvery` behavior, and `maxRows` enforcement remain in the worker. The UI continues to receive summaries rather than parsed containers.

No new worker-retained expansion state is introduced. Each request is self-contained, which preserves the existing stale-response protection based on the UI render token.

## UI Behavior

Add an `Expand all` secondary button beside the existing tree expansion controls.

While its refresh is pending, the status reads `Expanding all...`. On completion it returns to the standard visible-row count and truncation message. The action is reversible, so it does not require a confirmation dialog.

The virtual scrolling model, fixed row height, spacer calculation, and overscan count do not change.

## Search And Parsed Strings

Search reveal must make all ancestors of the selected match visible:

- in `explicit` mode, add ancestor path keys to `expandedKeys`;
- in `all` mode, remove ancestor path keys from `collapsedKeys`.

`Expand all` never parses JSON-looking strings. That would change data interpretation and could trigger unbounded extra parsing. A string node participates as a container only after the user has successfully used `Parse as JSON` and its cached display mode is `parsed`.

After a successful `Parse as JSON`:

- `explicit` mode adds that row to `expandedKeys`, preserving current behavior;
- `all` mode removes that row from `collapsedKeys`, so the newly available parsed subtree opens immediately.

Switching a cached string back to raw display makes it non-expandable without discarding either cache state or expansion exceptions.

## Failure And Race Handling

- Worker failures continue through the existing structured error response and UI error surface.
- A stale row response cannot replace a newer state because `refreshRows` keeps its render-token check.
- The 100,000-row limit is a successful truncated result, not an error.
- Expansion state uses canonical path arrays converted with `pathKey(path)`; no alternate node identity is introduced.

## Verification

Automated tests will cover:

- tree-model expansion in both modes;
- `collapsedKeys` overriding all-mode expansion;
- bounded root-size classification on both sides of the 5,000-row threshold;
- worker request and response behavior with the 100,000-row limit;
- `Expand all`, `Collapse all`, and `Expand root` state transitions;
- row toggling in both modes;
- search reveal through a manually collapsed ancestor;
- already-parsed string subtrees expanding without automatically parsing raw strings;
- project-file wiring for the new control.

Timing thresholds will not be added to the normal test suite because they are environment-sensitive. The existing deterministic row limit is the performance regression boundary.

Before completion, run the full `npm test` suite. A browser check should exercise the standalone viewer with nested sample data and confirm expand-all, manual collapse, reset, search reveal, parsed strings, and the truncated status on a large fixture.

## Out Of Scope

- Removing or raising the 100,000-row safety limit.
- Windowed or paginated worker row protocols.
- Automatically parsing JSON strings.
- Persisting expansion state across page reloads or newly loaded roots.
