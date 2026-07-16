export function formatValueForClipboard(value) {
  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function formatJavaScriptStringLiteral(value) {
  let content = '';

  for (const character of value) {
    if (character === "'") {
      content += "\\'";
    } else if (character === '\\') {
      content += '\\\\';
    } else if (character === '\n') {
      content += '\\n';
    } else if (character === '\r') {
      content += '\\r';
    } else if (character === '\t') {
      content += '\\t';
    } else if (character === '\b') {
      content += '\\b';
    } else if (character === '\f') {
      content += '\\f';
    } else if (character === '\v') {
      content += '\\v';
    } else if (character === '\u2028' || character === '\u2029') {
      content += `\\u${character.charCodeAt(0).toString(16)}`;
    } else if (character.charCodeAt(0) < 0x20) {
      content += `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`;
    } else {
      content += character;
    }
  }

  return `'${content}'`;
}

export function formatJsonStringLiteral(value) {
  return JSON.stringify(value);
}
