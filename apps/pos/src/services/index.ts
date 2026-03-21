import type { ITerminalService } from './terminal-service';
import { MockTerminalService } from './mock-terminal';
import type { IAudioService } from './audio-service';
import { ExpoAudioService } from './audio-service';
import type { IPrinterService } from './printer-service';
import { MockPrinterService } from './printer-service';

export type { ITerminalService, TerminalResult, TerminalStatus } from './terminal-service';
export type { IAudioService } from './audio-service';
export type { IPrinterService, PrinterStatus, ReportPrintData } from './printer-service';

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

// ---------------------------------------------------------------------------
// Printer Service Factory
// ---------------------------------------------------------------------------

let printerInstance: IPrinterService | null = null;

export function getPrinterService(): IPrinterService {
  if (!printerInstance) {
    printerInstance = new MockPrinterService();
  }
  return printerInstance;
}
