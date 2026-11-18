// Progress between visits (this browser only): the mission reached, the cash held, the
// weapon owned, whether the story is done, and the best cash ever held. Storage can be off
// (private windows); then progress lasts this visit only and nothing throws.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage off: the game still plays, it just does not remember.
  }
}
