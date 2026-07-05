export function pathKey(path) {
  return JSON.stringify(path);
}

export function appendPath(path, segment) {
  return [...path, segment];
}

export function formatPath(path) {
  if (path.length === 0) {
    return '$';
  }

  return path.reduce((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`;
    }

    if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      return `${result}.${segment}`;
    }

    return `${result}[${JSON.stringify(segment)}]`;
  }, '$');
}
