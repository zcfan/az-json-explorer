const REPOSITORY_BLOB_BASE_URL =
  'https://github.com/zcfan/az-json-explorer/blob/main/';
const INTEGRATION_GUIDE_BASE_URL =
  `${REPOSITORY_BLOB_BASE_URL}docs/integrations/open-in-az-json-explorer`;

function normalizeSubstitutions(substitutions) {
  if (substitutions === undefined) {
    return undefined;
  }

  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  return values.map((value) => String(value));
}

export function translate(key, fallback, substitutions) {
  const i18n = globalThis.chrome?.i18n;
  const getMessage = i18n?.getMessage;
  if (typeof getMessage !== 'function') {
    return fallback;
  }

  const message = getMessage.call(
    i18n,
    key,
    normalizeSubstitutions(substitutions),
  );
  return message || fallback;
}

export function localizeUi(root) {
  const attributes = [
    ['data-i18n', null],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-title', 'title'],
  ];

  for (const [keyAttribute, targetAttribute] of attributes) {
    for (const element of root.querySelectorAll(`[${keyAttribute}]`)) {
      const key = element.getAttribute(keyAttribute);
      if (!key) {
        continue;
      }

      if (targetAttribute) {
        const fallback = element.getAttribute(targetAttribute) || '';
        element.setAttribute(targetAttribute, translate(key, fallback));
      } else {
        const fallback = element.textContent.trim();
        element.textContent = translate(key, fallback);
      }
    }
  }
}

export function localizeDocument(document) {
  const language = globalThis.chrome?.i18n?.getUILanguage?.();
  if (language) {
    document.documentElement.lang = language;
  }
  document.title = translate('appName', document.title);
}

export function getLocalizedChangelogUrl() {
  const fileName =
    translate('documentationLocale', 'en') === 'zh-CN'
      ? 'CHANGELOG.zh-CN.md'
      : 'CHANGELOG.md';
  return `${REPOSITORY_BLOB_BASE_URL}${fileName}`;
}

export function getLocalizedIntegrationGuideUrl() {
  const localeSuffix =
    translate('documentationLocale', 'en') === 'zh-CN'
      ? '.zh-CN'
      : '';
  return `${INTEGRATION_GUIDE_BASE_URL}${localeSuffix}.md`;
}
