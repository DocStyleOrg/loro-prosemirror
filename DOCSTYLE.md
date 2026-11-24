# DocStyle's fork of loro-prosemirror

DocStyle depends on this fork's `main` as a git dependency, pinned to a commit. `main` is upstream's
`main` plus these branches, each opened (or to be opened) as a pull request against
[loro-dev/loro-prosemirror](https://github.com/loro-dev/loro-prosemirror):

| Branch                               | Change                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `fix/remote-changes-out-of-history`  | The initial load and remote changes stay out of ProseMirror's history                   |
| `fix/text-split-across-containers`   | A paragraph whose text is in several `LoroText`s keeps them all                         |
| `fix/co-typing-caret`                | The caret is restored in the same transaction as a remote change                        |
| `fix/remote-changes-minimal-replace` | A remote change replaces only what changed                                              |
| `feat/movable-children`              | The `movableChildren` option: children in `LoroMovableList`s, block moves as Loro moves |

Fork-only: the `prepare` script, which builds `dist/` when the package is installed from git, and
this file. Keep each branch on upstream's `main`, and merge it here; take upstream releases by
merging upstream's `main`.
