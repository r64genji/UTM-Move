declare const __DATA_FILES__: Record<string, string>

/** URL of a generated file in public/data. Builds serve them under content-hashed names (the service worker caches those forever). */
export function dataUrl(name: string): string {
  return `/data/${__DATA_FILES__[name] ?? name}`
}
