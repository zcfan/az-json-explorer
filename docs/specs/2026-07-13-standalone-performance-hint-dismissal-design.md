# Standalone Performance Hint Dismissal Design

## Goal

Allow users to permanently dismiss the performance hint shown at the top of the standalone viewer.

Success means:

- the standalone hint has an accessible close button;
- closing it hides it immediately;
- later standalone viewer sessions do not show it again;
- the direct-page performance warning remains visible and non-dismissible;
- no new extension permission or remote storage path is introduced.

## Persistence Decision

Store one boolean-like value in `localStorage` under a stable, feature-specific key. The standalone viewer runs on the extension origin, so this state persists across viewer tabs and browser restarts without adding the `storage` permission to `manifest.json`.

`chrome.storage.local` is rejected because its asynchronous API and new manifest permission provide no benefit for one viewer-local preference. IndexedDB is rejected as unnecessary complexity.

There is no in-product reset control. Clearing the extension's site data or reinstalling the extension restores the hint.

## UI And Data Flow

The shared banner keeps separate direct-page and standalone behavior:

1. Embedded direct-page loading shows the existing warning text. It does not read the dismissal key and does not expose a close button.
2. Standalone startup reads the dismissal key before showing the hint.
3. If the key is absent, the standalone-specific text and close button are shown.
4. Clicking close hides the banner immediately and writes the dismissed value.
5. If the key is present on a later startup, the hint stays hidden.

The close button will have an accessible label. It will be rendered inside the existing banner so the shared top-level layout and performance-warning styles remain intact.

## Failure Handling

If reading local storage fails, the viewer treats the hint as not dismissed and shows it. If writing fails, the current hint still closes, but it may reappear in a future viewer session. Storage failure must not prevent JSON loading or other viewer interactions.

## Verification

Automated tests will cover:

- missing storage state means the standalone hint is eligible to show;
- the dismissed value survives a new preference read;
- storage read and write failures do not throw;
- standalone wiring includes the close control and persistence path;
- direct-page warning behavior remains independent of the standalone dismissal state.

Before completion, run `npm test` and `git diff --check`. A browser check should close the standalone hint, reload the viewer, confirm it remains hidden, and confirm a direct JSON page still shows its warning.

## Out Of Scope

- A settings page or reset control.
- Synchronizing dismissal across Chrome profiles or devices.
- Making the direct-page warning dismissible.
- Changing file parsing, manual input, worker state, or the performance-warning copy.
