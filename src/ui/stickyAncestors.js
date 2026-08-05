export function createParentRowIndexes(rows) {
  const parentIndexes = new Int32Array(rows.length);
  parentIndexes.fill(-1);
  const latestIndexByDepth = [];

  for (let index = 0; index < rows.length; index += 1) {
    const depth = rows[index]?.depth;
    if (!Number.isInteger(depth) || depth < 0) {
      latestIndexByDepth.length = 0;
      continue;
    }

    if (depth > 0) {
      parentIndexes[index] = latestIndexByDepth[depth - 1] ?? -1;
    }
    latestIndexByDepth[depth] = index;
    latestIndexByDepth.length = depth + 1;
  }

  return parentIndexes;
}

export function getStickyAncestorIndexes(parentIndexes, rowIndex, maxCount = 10) {
  if (
    !parentIndexes ||
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= parentIndexes.length ||
    !Number.isInteger(maxCount) ||
    maxCount <= 0
  ) {
    return [];
  }

  const indexes = [];
  let currentIndex = parentIndexes[rowIndex];
  while (currentIndex >= 0 && indexes.length < maxCount) {
    indexes.push(currentIndex);
    currentIndex = parentIndexes[currentIndex];
  }

  return indexes.reverse();
}

export function getStickyViewportAncestorIndexes(
  parentIndexes,
  scrollTop,
  rowHeight,
  maxCount = 10,
  coveredThreshold = 0,
) {
  if (
    !parentIndexes ||
    parentIndexes.length === 0 ||
    !Number.isFinite(scrollTop) ||
    scrollTop < 0 ||
    !Number.isFinite(rowHeight) ||
    rowHeight <= 0 ||
    !Number.isFinite(coveredThreshold) ||
    coveredThreshold < 0
  ) {
    return [];
  }

  const topRowIndex = Math.min(
    Math.floor(scrollTop / rowHeight),
    parentIndexes.length - 1,
  );
  const topRowOffset = scrollTop - topRowIndex * rowHeight;
  let deepestCoveredAncestorIndexes = [];

  for (let offset = 0; offset <= maxCount + 1; offset += 1) {
    const rowIndex = topRowIndex + offset;
    if (rowIndex >= parentIndexes.length) {
      break;
    }

    const ancestorIndexes = getStickyAncestorIndexes(parentIndexes, rowIndex, maxCount);
    const rowTop = offset * rowHeight - topRowOffset;
    const stickyBottom = ancestorIndexes.length * rowHeight;
    const coveredPixels = stickyBottom - rowTop;
    if (
      coveredPixels > 0 &&
      coveredPixels >= coveredThreshold &&
      ancestorIndexes.length > deepestCoveredAncestorIndexes.length
    ) {
      deepestCoveredAncestorIndexes = ancestorIndexes;
    }
  }

  return deepestCoveredAncestorIndexes;
}
