/**
 * Types for the dictionary layer. Everything is derived from the English
 * dictionary, which is the reference locale: a key that does not exist there is
 * a compile error at the call site, and a locale missing a key is a compile
 * error in that locale's file.
 */
import type { en } from './en';

/** Every message key the UI may ask for. */
export type MessageKey = keyof typeof en;

/** A complete locale. Annotate every locale file with this. */
export type Dictionary = Record<MessageKey, string>;

/** Pulls `{name}` placeholders out of a literal message string. */
export type ExtractPlaceholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | ExtractPlaceholders<Rest>
  : never;

type PlaceholdersOf<K extends MessageKey> = ExtractPlaceholders<(typeof en)[K]>;

/**
 * Trailing argument list for `t()`: keys with no placeholders take no second
 * argument, keys with placeholders require exactly the ones they name.
 */
export type MessageArgs<K extends MessageKey> = [PlaceholdersOf<K>] extends [never]
  ? []
  : [params: Record<PlaceholdersOf<K>, string | number>];
