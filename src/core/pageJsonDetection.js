export function isLikelyJsonContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase().split(';')[0].trim();
  return normalized === 'application/json' || normalized.endsWith('+json');
}

export function isLikelyRawJsonText(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return false;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '{' && last === '}') || (first === '[' && last === ']');
}

export function isLikelyJsonUrl(href) {
  try {
    const url = new URL(String(href || ''));
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'file:' && protocol !== 'http:' && protocol !== 'https:') {
      return false;
    }

    return url.pathname.toLowerCase().endsWith('.json');
  } catch {
    return false;
  }
}

function getElementChildren(body) {
  return Array.from(body?.children || []);
}

function getOnlyPreElement(documentLike) {
  const children = getElementChildren(documentLike.body);
  if (children.length !== 1 || String(children[0].tagName || '').toUpperCase() !== 'PRE') {
    return null;
  }

  return children[0];
}

function getLocationHref(locationLike) {
  return String(locationLike?.href || '');
}

export function detectJsonPageSource(documentLike, locationLike) {
  if (!documentLike?.body) {
    return null;
  }

  const href = getLocationHref(locationLike);
  if (href && isLikelyJsonContentType(documentLike.contentType)) {
    return {
      kind: 'url',
      url: href,
    };
  }

  if (href && isLikelyJsonUrl(href) && getOnlyPreElement(documentLike)) {
    return {
      kind: 'url',
      url: href,
    };
  }

  const text = extractLikelyRawJsonText(documentLike);
  if (!text) {
    return null;
  }

  return {
    kind: 'text',
    text,
  };
}

export function extractLikelyRawJsonText(documentLike) {
  if (!documentLike?.body) {
    return null;
  }

  const preElement = getOnlyPreElement(documentLike);
  if (preElement) {
    const preText = preElement.textContent;
    if (isLikelyRawJsonText(preText)) {
      return preText;
    }
  }

  const bodyText = documentLike.body.textContent || '';
  if (isLikelyJsonContentType(documentLike.contentType) && isLikelyRawJsonText(bodyText)) {
    return bodyText;
  }

  const children = getElementChildren(documentLike.body);
  if (children.length === 0 && isLikelyRawJsonText(bodyText)) {
    return bodyText;
  }

  return null;
}
