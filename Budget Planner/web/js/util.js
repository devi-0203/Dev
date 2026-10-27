// Formatting, dates, preferences and notifications.

export const CURRENCIES = ['₹', '$', '€', '£', '¥'];

export const CATEGORIES = [
  { name: 'Food',      icon: '🍜', color: '#F59E3F' },
  { name: 'Transport', icon: '🚌', color: '#3E8EDE' },
  { name: 'Rent',      icon: '🏠', color: '#8B6FD6' },
  { name: 'Books',     icon: '📚', color: '#2FA67F' },
  { name: 'Fun',       icon: '🎬', color: '#E3568E' },
  { name: 'Shopping',  icon: '🛍️', color: '#E0614B' },
  { name: 'Health',    icon: '💊', color: '#2BAFC4' },
  { name: 'Other',     icon: '✨', color: '#7C8A85' },
];
export const catOf = (name) => CATEGORIES.find((c) => c.name === name) || CATEGORIES[CATEGORIES.length - 1];

// ---- preferences (stored on the device) ----
const LS = window.localStorage;
export const prefs = {
  get currency() { return LS.getItem('pw.currency') || '₹'; },
  set currency(v) { LS.setItem('pw.currency', v); },
  get theme() { return LS.getItem('pw.theme') || 'auto'; },
  set theme(v) { LS.setItem('pw.theme', v); },
  get notify() { return LS.getItem('pw.notify') === '1'; },
  set notify(v) { LS.setItem('pw.notify', v ? '1' : '0'); },
};

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = prefs.theme;
}

// ---- formatting ----
export function money(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const locale = prefs.currency === '₹' ? 'en-IN' : 'en-US';
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  const text = abs.toLocaleString(locale, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${v < 0 ? '−' : ''}${prefs.currency}${text}`;
}

/** Turns "1,250.50" or "1250" into a number; returns NaN when it isn't one. */
export function parseAmount(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '');
  if (cleaned === '' || !/^\d*\.?\d{0,2}$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- dates (always the device's local calendar) ----
export const pad = (n) => String(n).padStart(2, '0');
export const ymOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const isoOf = (d) => `${ymOf(d)}-${pad(d.getDate())}`;
export const ymNow = () => ymOf(new Date());
export const isoToday = () => isoOf(new Date());

const parts = (ym) => ym.split('-').map(Number);
export function monthLabel(ym) {
  const [y, m] = parts(ym);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function monthShort(ym) {
  const [y, m] = parts(ym);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}
export function dayLabel(iso) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === isoToday()) return 'Today';
  if (iso === isoOf(yesterday)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---- phone/browser notifications ----
export async function enableNotifications() {
  if (!('Notification' in window)) return false;
  const result = await Notification.requestPermission();
  prefs.notify = result === 'granted';
  return prefs.notify;
}

export function systemNotify(title, body) {
  if (!prefs.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body }); } catch { /* some browsers only allow this from a service worker */ }
}
