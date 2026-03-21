import type { ITerminalService } from './terminal-service';
import { MockTerminalService } from './mock-terminal';
import type { IAudioService } from './audio-service';
import { ExpoAudioService } from './audio-service';

export type { ITerminalService, TerminalResult, TerminalStatus } from './terminal-service';
export type { IAudioService } from './audio-service';

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

// ---------------------------------------------------------------------------
// Audio Service Factory
// ---------------------------------------------------------------------------

let audioInstance: IAudioService | null = null;

export function getAudioService(): IAudioService {
  if (!audioInstance) {
    audioInstance = new ExpoAudioService();
  }
  return audioInstance;
}
