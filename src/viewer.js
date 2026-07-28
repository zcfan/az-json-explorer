import { mountJsonViewer } from './ui/viewerApp.js';
import { INTERNAL_LAUNCH_CLAIM_TYPE } from './core/externalLaunch.js';
import { localizeDocument, translate } from './core/i18n.js';

const params = new URLSearchParams(window.location.search);
const embedded = params.get('embedded') === '1';
const launchId = embedded ? null : params.get('launch');
const currentVersion = globalThis.chrome?.runtime?.getManifest?.().version || '';
localizeDocument(document);

const app = mountJsonViewer(document.getElementById('app'), {
  embedded,
  currentVersion,
  styleUrl: new URL('./ui/styles.css', import.meta.url).href,
  workerUrl: new URL('./worker/jsonWorker.js', import.meta.url).href,
});

if (embedded) {
  app.setSourceLabel(translate('waitingForJsonPage', 'Waiting for JSON page...'));
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'json-tools-content-script') {
      return;
    }

    if (event.data.type === 'load-json') {
      app.showDirectFileBanner();
      app.setSourceLabel(
        event.data.sourceLabel || translate('jsonPage', 'JSON page'),
      );
      app.parseText(event.data.text);
    }

    if (event.data.type === 'load-json-file') {
      app.showDirectFileBanner();
      app.parseFile(
        event.data.file,
        event.data.sourceLabel || translate('jsonPage', 'JSON page'),
      );
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
  app.setSourceLabel(translate('loadingSharedJson', 'Loading shared JSON...'));
  app.setStatus(translate('waitingForSharedJson', 'Waiting for shared JSON...'));

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
      response?.error?.message ||
        translate(
          'sharedJsonPayloadUnavailable',
          'The shared JSON payload is unavailable.',
        ),
    );
    return;
  }

  app.setSourceLabel(
    response.payload.sourceLabel || translate('sharedJson', 'Shared JSON'),
  );
  await app.parseText(response.payload.jsonText);
}

function showExternalLaunchError(message) {
  app.setSourceLabel(translate('externalLaunch', 'External launch'));
  app.showError(message);
  app.setStatus(
    translate(
      'sharedJsonLoadFailed',
      'Shared JSON could not be loaded. You can still paste JSON or open a file.',
    ),
  );
}

function removeLaunchIdFromUrl() {
  const cleanParams = new URLSearchParams(window.location.search);
  cleanParams.delete('launch');
  const query = cleanParams.toString();
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', cleanUrl);
}
