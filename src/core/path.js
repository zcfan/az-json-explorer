export function pathKey(path) {
  return JSON.stringify(path);
}

export function appendPath(path, segment) {
  return [...path, segment];
}

function formatPropertyAccess(segment) {
  if (typeof segment === 'number') {
    return `[${segment}]`;
  }

  if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
    return `.${segment}`;
  }

  return `[${JSON.stringify(segment)}]`;
}

export function formatPath(path) {
  if (path.length === 0) {
    return '$';
  }

  return path.reduce((result, segment) => {
    return `${result}${formatPropertyAccess(segment)}`;
  }, '$');
}

export function formatCopyPath(path, parseCache = null, options = {}) {
  let expression = options.rootName || 'root';
  let currentPath = [];

  for (const segment of path) {
    if (currentPath.length > 0 && parseCache?.hasParsed?.(currentPath)) {
      expression = `JSON.parse(${expression})`;
    }

    expression = `${expression}${formatPropertyAccess(segment)}`;
    currentPath = appendPath(currentPath, segment);
  }

  return expression;
}
