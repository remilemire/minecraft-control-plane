// A participant in an aggregate commit. Only the owning state service can
// construct/execute it; consumers can combine changes without seeing a draft.
declare const commitEffect: unique symbol;
export interface CommitEffect {
  readonly [commitEffect]: true;
}
