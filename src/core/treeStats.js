function isContainer(value) {
  return Array.isArray(value) || Boolean(value && typeof value === 'object');
}

function* iterateChildValues(value) {
  if (Array.isArray(value)) {
    for (const child of value) {
      yield child;
    }
    return;
  }

  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      yield value[key];
    }
  }
}

export function countJsonNodesUpTo(rootValue, maxNodes) {
  const limit = Math.max(0, Math.floor(maxNodes));
  if (limit === 0) {
    return { count: 0, truncated: true };
  }

  let count = 1;
  const iterators = isContainer(rootValue) ? [iterateChildValues(rootValue)] : [];

  while (iterators.length > 0) {
    const iterator = iterators[iterators.length - 1];
    const next = iterator.next();

    if (next.done) {
      iterators.pop();
      continue;
    }

    if (count >= limit) {
      return { count, truncated: true };
    }

    count += 1;
    if (isContainer(next.value)) {
      iterators.push(iterateChildValues(next.value));
    }
  }

  return { count, truncated: false };
}
