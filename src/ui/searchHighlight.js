export function splitHighlightedText(text, query, { caseSensitive = false } = {}) {
  const source = String(text ?? '');
  const needle = String(query ?? '');

  if (!needle) {
    return [{ text: source, highlighted: false }];
  }

  const haystack = caseSensitive ? source : source.toLowerCase();
  const normalizedNeedle = caseSensitive ? needle : needle.toLowerCase();
  const parts = [];
  let cursor = 0;
  let index = haystack.indexOf(normalizedNeedle);

  while (index !== -1) {
    if (index > cursor) {
      parts.push({ text: source.slice(cursor, index), highlighted: false });
    }

    parts.push({
      text: source.slice(index, index + needle.length),
      highlighted: true,
    });
    cursor = index + needle.length;
    index = haystack.indexOf(normalizedNeedle, cursor);
  }

  if (cursor < source.length) {
    parts.push({ text: source.slice(cursor), highlighted: false });
  }

  return parts.length > 0 ? parts : [{ text: source, highlighted: false }];
}

export function getRowSearchState(row, matches, selectedIndex) {
  const rowMatches = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.pathKey === row.pathKey);

  return {
    highlighted: rowMatches.length > 0,
    current: rowMatches.some(({ index }) => index === selectedIndex),
    keyMatched: rowMatches.some(({ match }) => match.source === 'key'),
    valueMatched: rowMatches.some(({ match }) => match.source === 'value'),
  };
}
