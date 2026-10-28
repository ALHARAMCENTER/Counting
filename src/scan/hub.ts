import { feedbackError } from '../lib/feedback';
import { installKeyboardHub, KeyboardHub } from './keyboardHub';

/** App-wide instance. A scan outside any counting screen is refused loudly. */
export const keyboardHub = new KeyboardHub(() => feedbackError());

export function initKeyboardHub(): void {
  installKeyboardHub(keyboardHub);
}
