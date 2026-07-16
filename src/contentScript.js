(async () => {
  const [{ installPageLaunchBridge }, { detectJsonPageSource, extractLikelyRawJsonText }] =
    await Promise.all([
      import(chrome.runtime.getURL('src/core/pageLaunchBridge.js')),
      import(chrome.runtime.getURL('src/core/pageJsonDetection.js')),
    ]);

  if (!window.__azJsonExplorerBridgeInstalled) {
    installPageLaunchBridge({
      windowObject: window,
      documentObject: document,
      sendRequest: (request) => chrome.runtime.sendMessage(request),
    });
    window.__azJsonExplorerBridgeInstalled = true;
  }

  if (window.__jsonToolsMounted) {
    return;
  }

  const pageSource = detectJsonPageSource(document, window.location);
  if (!pageSource) {
    return;
  }

  window.__jsonToolsMounted = true;
  const loadMessage = await createLoadMessage(pageSource, document, extractLikelyRawJsonText);

  document.documentElement.classList.add('json-tools-mounted');
  document.documentElement.style.height = '100%';
  document.body.textContent = '';
  document.body.style.margin = '0';
  document.body.style.height = '100%';

  const iframe = document.createElement('iframe');
  iframe.id = 'json-tools-root';
  iframe.src = chrome.runtime.getURL('src/viewer.html?embedded=1');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.addEventListener('load', () => {
    iframe.contentWindow.postMessage(
      {
        source: 'json-tools-content-script',
        sourceLabel: window.location.href,
        ...loadMessage,
      },
      new URL(iframe.src).origin,
    );
  });
  document.body.append(iframe);
})().catch((error) => {
  console.error('[AZ JSON Explorer] Failed to mount viewer', error);
});

async function createLoadMessage(pageSource, documentLike, extractText) {
  if (pageSource.kind === 'url') {
    try {
      return createFileLoadMessage(await fetchPageBlob(pageSource.url));
    } catch (error) {
      const fallbackText = extractText(documentLike);
      if (!fallbackText) {
        throw error;
      }

      return createFileLoadMessage(createJsonBlob(fallbackText));
    }
  }

  return createFileLoadMessage(createJsonBlob(pageSource.text));
}

function createFileLoadMessage(file) {
  return {
    type: 'load-json-file',
    file,
  };
}

function createJsonBlob(text) {
  return new Blob([text], { type: 'application/json' });
}

async function fetchPageBlob(url) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'force-cache',
  });

  if (!response.ok && response.status !== 0) {
    throw new Error(`Failed to fetch JSON page: HTTP ${response.status}`);
  }

  return response.blob();
}
