const FILE_MAX = 36;

/** "Spider-Man…YTS.MX.mp4" — head + tail of a long file name, like the mockup's cancel dialog text (pure). */
export function shortFileName(name: string, max = FILE_MAX): string {
  if (name.length <= max) return name;
  const head = Math.ceil((max - 1) * 0.4);
  return `${name.slice(0, head)}…${name.slice(-(max - 1 - head))}`;
}
