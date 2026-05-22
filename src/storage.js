import { createEmptyState, normalizeState } from './state.js';

const STORAGE_KEY = 'interest-class-checkin-state-v1';

export { createEmptyState };

export function loadState(storage = globalThis.localStorage) {
  const resolvedStorage = storage ?? globalThis.localStorage;
  if (!resolvedStorage) return createEmptyState();

  const raw = resolvedStorage.getItem(STORAGE_KEY);
  if (!raw) return createEmptyState();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createEmptyState();
  }

  if (!parsed || typeof parsed !== 'object') return createEmptyState();
  if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.records)) return createEmptyState();

  return normalizeState(parsed);
}

export function saveState(storage = globalThis.localStorage, state) {
  if (!storage) throw new Error('storage unavailable');

  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}
