import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { z } from 'zod';

export const PronunciationEntry = z.union([
  z.string().min(1),
  z.object({ say: z.string().min(1), caseSensitive: z.boolean().default(false) }),
]);
export const PronunciationDict = z.record(z.string().min(1), PronunciationEntry);
export type PronunciationDictType = z.infer<typeof PronunciationDict>;

/** Đọc từ điển phát âm từ file JSON */
export async function loadPronunciationDict(path: string): Promise<PronunciationDictType> {
  if (!existsSync(path)) return {};
  return PronunciationDict.parse(JSON.parse(await readFile(path, 'utf8')));
}

/** Gộp nhiều từ điển; từ điển sau ghi đè từ điển trước */
export function mergePronunciationDicts(...dicts: (PronunciationDictType | undefined)[]): PronunciationDictType {
  const byLower = new Map<string, [string, z.infer<typeof PronunciationEntry>]>();
  for (const dict of dicts) {
    for (const [term, entry] of Object.entries(dict ?? {})) {
      byLower.set(term.toLowerCase(), [term, entry]);
    }
  }
  return Object.fromEntries(byLower.values());
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEFORE = '(?<![\\p{L}\\p{N}_])';
const AFTER = '(?![\\p{L}\\p{N}_])';

/**
 * Chuẩn hóa các thuật ngữ trong văn bản theo từ điển phát âm trước khi gửi tới TTS
 */
export function applyPronunciation(text: string, dict: PronunciationDictType): string {
  // Thay thế đơn vị m sau số (ví dụ: 5 m -> 5 mét, 20m -> 20 mét)
  let processed = text.replace(/(\d+)\s*m(?![a-zA-Z0-9²³])/g, '$1 mét');

  const entries = Object.entries(dict)
    .map(([term, entry]) =>
      typeof entry === 'string'
        ? { term, say: entry, caseSensitive: false }
        : { term, say: entry.say, caseSensitive: entry.caseSensitive ?? false })
    .filter((e) => e.term !== e.say)
    .sort((a, b) => b.term.length - a.term.length);

  if (entries.length === 0) return processed;

  const pattern = new RegExp(
    `${BEFORE}(?:${entries.map((e) => `(${escapeRegex(e.term)})`).join('|')})${AFTER}`,
    'giu',
  );

  return processed.replace(pattern, (match, ...groups: unknown[]) => {
    const i = groups.findIndex((g, idx) => idx < entries.length && g !== undefined);
    const e = entries[i];
    if (!e || (e.caseSensitive && match !== e.term)) return match;
    return e.say;
  });
}
