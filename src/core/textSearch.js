const DEFAULT_CHUNK_SIZE = 256 * 1024;
const DEFAULT_CONTEXT = 42;
const DEFAULT_MAX_RESULTS = 500;

function waitForNextTurn() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function normalizeText(value, caseSensitive) {
  return caseSensitive ? value : value.toLowerCase();
}

function createPreview(text, index, length, context) {
  const start = Math.max(0, index - context);
  const end = Math.min(text.length, index + length + context);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, ' ');
}

export async function findTextMatches(text, query, options = {}) {
  const source = String(text || '');
  const rawQuery = String(query || '');
  const caseSensitive = options.caseSensitive === true;
  const needle = normalizeText(rawQuery, caseSensitive);
  const chunkSize = Math.max(1, options.chunkSize || DEFAULT_CHUNK_SIZE);
  const context = Math.max(0, options.context ?? DEFAULT_CONTEXT);
  const maxResults = Math.max(0, options.maxResults ?? DEFAULT_MAX_RESULTS);

  if (!needle || maxResults === 0) {
    return {
      query: rawQuery,
      matches: [],
      truncated: false,
      searchedBytes: source.length,
    };
  }

  const searchableSource = normalizeText(source, caseSensitive);
  const matches = [];
  const overlap = Math.max(0, needle.length - 1);
  let truncated = false;

  for (let chunkStart = 0; chunkStart < source.length; chunkStart += chunkSize) {
    const acceptedStart = chunkStart;
    const acceptedEnd = Math.min(source.length, chunkStart + chunkSize);
    const segmentEnd = Math.min(source.length, acceptedEnd + overlap);
    const segment = searchableSource.slice(chunkStart, segmentEnd);
    let localIndex = segment.indexOf(needle);

    while (localIndex !== -1) {
      const index = chunkStart + localIndex;
      if (index >= acceptedStart && index < acceptedEnd) {
        matches.push({
          index,
          length: rawQuery.length,
          preview: createPreview(source, index, rawQuery.length, context),
        });

        if (matches.length >= maxResults) {
          truncated = searchableSource.indexOf(needle, index + Math.max(needle.length, 1)) !== -1;
          return {
            query: rawQuery,
            matches,
            truncated,
            searchedBytes: source.length,
          };
        }
      }

      localIndex = segment.indexOf(needle, localIndex + Math.max(needle.length, 1));
    }

    await waitForNextTurn();
  }

  return {
    query: rawQuery,
    matches,
    truncated,
    searchedBytes: source.length,
  };
}
