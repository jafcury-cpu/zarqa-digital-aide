// Per-device chat preferences stored in localStorage so they survive reloads
// and can be toggled cross-tab via the `storage` event.

export const REALTIME_TOAST_PREF_KEY = "luize.chat.realtimeToastsMuted";

export function getRealtimeToastsMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REALTIME_TOAST_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRealtimeToastsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REALTIME_TOAST_PREF_KEY, muted ? "1" : "0");
    // Notify same-tab listeners (storage event only fires across tabs)
    window.dispatchEvent(new CustomEvent("luize:chat-prefs-changed"));
  } catch {
    /* ignore quota / privacy mode errors */
  }
}
