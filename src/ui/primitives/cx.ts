/**
 * Class joiner. Deliberately not `clsx`: the whole need is "drop falsy, join
 * with a space", and a dependency for six lines is debt with a download cost.
 */
export type ClassValue = string | false | null | undefined;

export const cx = (...parts: ClassValue[]): string => {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out = out === '' ? part : `${out} ${part}`;
  }
  return out;
};
