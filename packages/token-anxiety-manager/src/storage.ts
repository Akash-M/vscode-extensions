// Persists the ledger in VS Code globalState (Memento), implementing the
// engine's Storage interface so the core stays editor-agnostic.

import type * as vscode from 'vscode';
import type { Storage, LedgerState } from './core/index.ts';

const KEY = 'tokenAnxiety.ledger.v1';

export class MementoStorage implements Storage {
  private readonly memento: vscode.Memento;

  constructor(memento: vscode.Memento) {
    this.memento = memento;
  }

  load(): LedgerState | undefined {
    return this.memento.get<LedgerState>(KEY);
  }

  save(state: LedgerState): void {
    void this.memento.update(KEY, state);
  }
}
