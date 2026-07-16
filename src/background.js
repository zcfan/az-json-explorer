import {
  EXTERNAL_LAUNCH_CHANNEL,
  INTERNAL_LAUNCH_CLAIM_TYPE,
  createExternalLaunchErrorResponse,
  createLaunchBroker,
} from './core/externalLaunch.js';

const viewerUrl = chrome.runtime.getURL('src/viewer.html');
const broker = createLaunchBroker({
  openTab: async (launchId) => chrome.tabs.create({
    active: true,
    url: `${viewerUrl}?launch=${encodeURIComponent(launchId)}`,
  }),
});

function respondAsync(responsePromise, request, sendResponse) {
  Promise.resolve(responsePromise).then(
    (response) => sendResponse(response),
    (error) => sendResponse(createExternalLaunchErrorResponse(
      request,
      'OPEN_FAILED',
      error instanceof Error ? error.message : String(error),
    )),
  );
  return true;
}

function isViewerSender(sender) {
  return sender.id === chrome.runtime.id && sender.url?.startsWith(viewerUrl);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type === INTERNAL_LAUNCH_CLAIM_TYPE) {
    if (!isViewerSender(sender) || typeof request.launchId !== 'string') {
      sendResponse({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid external launch claim.',
        },
      });
      return false;
    }

    const payload = broker.claim(request.launchId);
    sendResponse(payload
      ? { ok: true, payload }
      : {
          ok: false,
          error: {
            code: 'HANDOFF_TIMEOUT',
            message: 'The shared JSON payload is no longer available.',
          },
        });
    return false;
  }

  if (request?.channel !== EXTERNAL_LAUNCH_CHANNEL) {
    return undefined;
  }

  const callerKey = `page:${sender.tab?.id ?? 'unknown'}:${sender.frameId ?? 0}`;
  return respondAsync(broker.handleRequest(request, { callerKey }), request, sendResponse);
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request?.channel !== EXTERNAL_LAUNCH_CHANNEL) {
    return undefined;
  }

  const callerKey = `extension:${sender.id ?? 'unknown'}`;
  return respondAsync(broker.handleRequest(request, { callerKey }), request, sendResponse);
});
