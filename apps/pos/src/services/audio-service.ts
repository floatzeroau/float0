import { Audio, type AVPlaybackStatus } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const successChimeAsset = require('../../assets/sounds/success-chime.wav') as number;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IAudioService {
  playSuccessChime(): Promise<void>;
  isAudioEnabled(): Promise<boolean>;
  setAudioEnabled(enabled: boolean): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const AUDIO_ENABLED_KEY = '@float0/audio_enabled';

export class ExpoAudioService implements IAudioService {
  async playSuccessChime(): Promise<void> {
    try {
      const enabled = await this.isAudioEnabled();
      if (!enabled) return;

      const { sound } = await Audio.Sound.createAsync(successChimeAsset);
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
      await sound.playAsync();
    } catch {
      // Graceful degradation — audio failure should never break the UI
    }
  }

  async isAudioEnabled(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(AUDIO_ENABLED_KEY);
      return val !== 'false'; // default: enabled
    } catch {
      return true;
    }
  }

  async setAudioEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
    } catch {
      // ignore storage errors
    }
  }
}
