import type { ITerminalService } from './terminal-service';
import { MockTerminalService } from './mock-terminal';

export type { ITerminalService, TerminalResult, TerminalStatus } from './terminal-service';

// ---------------------------------------------------------------------------
// Terminal Service Factory
// ---------------------------------------------------------------------------

type TerminalType = 'mock' | 'ingenico';

const TERMINAL_TYPE: TerminalType = 'mock';

let instance: ITerminalService | null = null;

export function getTerminalService(): ITerminalService {
  if (!instance) {
    switch (TERMINAL_TYPE) {
      case 'mock':
        instance = new MockTerminalService();
        break;
      case 'ingenico':
        // Future: instance = new IngenicoTerminalService();
        throw new Error('Ingenico terminal not yet implemented');
      default:
        throw new Error(`Unknown terminal type: ${TERMINAL_TYPE}`);
    }
  }
  return instance;
}
