export function createStringSearchSegments(text, absoluteOffset, matches, selectedIndex) {
  const source = String(text ?? '');
  const pageStart = Math.max(0, absoluteOffset || 0);
  const pageEnd = pageStart + source.length;
  const segments = [];
  let cursor = 0;

  matches.forEach((match, matchIndex) => {
    const matchStart = match.valueIndex;
    const matchEnd = matchStart + match.length;
    if (matchEnd <= pageStart || matchStart >= pageEnd) {
      return;
    }

    const start = Math.max(cursor, Math.max(0, matchStart - pageStart));
    const end = Math.min(source.length, matchEnd - pageStart);
    if (start > cursor) {
      segments.push({
        text: source.slice(cursor, start),
        highlighted: false,
        current: false,
      });
    }
    if (end > start) {
      segments.push({
        text: source.slice(start, end),
        highlighted: true,
        current: matchIndex === selectedIndex,
      });
      cursor = end;
    }
  });

  if (cursor < source.length || segments.length === 0) {
    segments.push({
      text: source.slice(cursor),
      highlighted: false,
      current: false,
    });
  }

  return segments;
}
