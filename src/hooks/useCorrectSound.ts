import { useAudioPlayer } from 'expo-audio';

const CORRECT_SOUND = require('../../assets/sounds/correct.wav');

/**
 * Shared "right answer" chime for all three levels. Returns a stable
 * `playCorrect()` you can call from any correct-answer event handler.
 * `seekTo(0)` before `play()` lets the same player retrigger cleanly even if
 * the previous chime hasn't finished (e.g. two quick correct actions).
 */
export function useCorrectSound(): () => void {
  const player = useAudioPlayer(CORRECT_SOUND);

  return () => {
    player.seekTo(0);
    player.play();
  };
}
