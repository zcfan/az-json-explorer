import {
  EXTERNAL_LAUNCH_CHANNEL,
  EXTERNAL_LAUNCH_VERSION,
  createExternalLaunchErrorResponse,
} from './externalLaunch.js';

export const PAGE_LAUNCH_GESTURE_WINDOW_MS = 5_000;

export function installPageLaunchBridge({
  windowObject,
  documentObject,
  sendRequest,
  now = Date.now,
  gestureWindowMs = PAGE_LAUNCH_GESTURE_WINDOW_MS,
}) {
  let lastGestureAt = Number.NEGATIVE_INFINITY;
  let gestureAvailable = false;

  const handleClick = (event) => {
    if (!event.isTrusted) {
      return;
    }
    lastGestureAt = now();
    gestureAvailable = true;
  };

  const handleMessage = async (event) => {
    const request = event.data;
    if (
      event.source !== windowObject ||
      request?.channel !== EXTERNAL_LAUNCH_CHANNEL ||
      !['ping', 'open'].includes(request?.type)
    ) {
      return;
    }

    if (request.version !== EXTERNAL_LAUNCH_VERSION) {
      windowObject.postMessage(
        createExternalLaunchErrorResponse(
          request,
          'UNSUPPORTED_VERSION',
          'Unsupported AZ JSON Explorer protocol version.',
        ),
        event.origin === 'null' ? '*' : event.origin,
      );
      return;
    }

    if (request.type === 'open') {
      const hasCurrentGesture = gestureAvailable && now() - lastGestureAt <= gestureWindowMs;
      if (!hasCurrentGesture) {
        windowObject.postMessage(
          createExternalLaunchErrorResponse(
            request,
            'USER_GESTURE_REQUIRED',
            'Open AZ JSON Explorer from a user click.',
          ),
          event.origin === 'null' ? '*' : event.origin,
        );
        return;
      }
      gestureAvailable = false;
    }

    const forwardedRequest = request.type === 'open' && !request.sourceLabel
      ? { ...request, sourceLabel: documentObject.title || windowObject.location.href }
      : request;
    let response;
    try {
      response = await sendRequest(forwardedRequest);
    } catch (error) {
      response = createExternalLaunchErrorResponse(
        request,
        'NOT_AVAILABLE',
        error instanceof Error ? error.message : 'AZ JSON Explorer is not available.',
      );
    }
    windowObject.postMessage(response, event.origin === 'null' ? '*' : event.origin);
  };

  windowObject.addEventListener('click', handleClick, true);
  windowObject.addEventListener('message', handleMessage);

  return () => {
    windowObject.removeEventListener('click', handleClick, true);
    windowObject.removeEventListener('message', handleMessage);
  };
}
