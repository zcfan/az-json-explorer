import { mountJsonViewer } from './ui/viewerApp.js';
import { INTERNAL_LAUNCH_CLAIM_TYPE } from './core/externalLaunch.js';

const params = new URLSearchParams(window.location.search);
const embedded = params.get('embedded') === '1';
const launchId = embedded ? null : params.get('launch');

const app = mountJsonViewer(document.getElementById('app'), {
  embedded,
  sourceLabel: 'Standalone viewer',
  styleUrl: new URL('./ui/styles.css', import.meta.url).href,
  workerUrl: new URL('./worker/jsonWorker.js', import.meta.url).href,
});

if (embedded) {
  app.setSourceLabel('Waiting for JSON page...');
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'json-tools-content-script') {
      return;
    }

    if (event.data.type === 'load-json') {
      app.showDirectFileBanner();
      app.setSourceLabel(event.data.sourceLabel || 'JSON page');
      app.parseText(event.data.text);
    }

    if (event.data.type === 'load-json-file') {
      app.showDirectFileBanner();
      app.parseFile(event.data.file, event.data.sourceLabel || 'JSON page');
    }
  });
} else if (launchId) {
  loadExternalLaunch(launchId).catch((error) => {
    removeLaunchIdFromUrl();
    showExternalLaunchError(error instanceof Error ? error.message : String(error));
  });
} else {
  app.showStandalonePerformanceBanner();
}

async function loadExternalLaunch(id) {
  app.setSourceLabel('Loading shared JSON...');
  app.setStatus('Waiting for shared JSON...');

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: INTERNAL_LAUNCH_CLAIM_TYPE,
      launchId: id,
    });
  } catch (error) {
    response = {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  removeLaunchIdFromUrl();
  if (!response?.ok) {
    showExternalLaunchError(
      response?.error?.message || 'The shared JSON payload is unavailable.',
    );
    return;
  }

  app.setSourceLabel(response.payload.sourceLabel || 'Shared JSON');
  await app.parseText(response.payload.jsonText);
}

function showExternalLaunchError(message) {
  app.setSourceLabel('External launch');
  app.showError(message);
  app.setStatus('Shared JSON could not be loaded. You can still paste JSON or open a file.');
}

function removeLaunchIdFromUrl() {
  const cleanParams = new URLSearchParams(window.location.search);
  cleanParams.delete('launch');
  const query = cleanParams.toString();
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', cleanUrl);
}
