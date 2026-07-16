export const AZ_JSON_EXPLORER_WEB_STORE_ID = 'logkfmmknmmkpflgamhddeaedneaankj';
export const AZ_JSON_EXPLORER_STORE_URL =
  `https://chromewebstore.google.com/detail/az-json-explorer/${AZ_JSON_EXPLORER_WEB_STORE_ID}`;

const CHANNEL = 'az-json-explorer';
const VERSION = 1;
const AVAILABILITY_TIMEOUT_MS = 1_000;
const OPEN_RESPONSE_TIMEOUT_MS = 11_000;

export class AzJsonExplorerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AzJsonExplorerError';
    this.code = code;
  }
}

function createRequest(type, requestId, fields = {}) {
  return {
    channel: CHANNEL,
    version: VERSION,
    requestId,
    type,
    ...fields,
  };
}

function assertSuccessfulResponse(response) {
  if (response?.ok) {
    return response.result;
  }
  throw new AzJsonExplorerError(
    response?.error?.code || 'NOT_AVAILABLE',
    response?.error?.message || 'AZ JSON Explorer is not available.',
  );
}

function assertMatchingResponse(request, response) {
  if (
    response?.channel !== CHANNEL ||
    response?.version !== VERSION ||
    response?.requestId !== request.requestId ||
    typeof response?.ok !== 'boolean'
  ) {
    throw new AzJsonExplorerError(
      'NOT_AVAILABLE',
      'AZ JSON Explorer returned an invalid response.',
    );
  }
  return response;
}

export function createAzJsonExplorerClient(
  { extensionId = AZ_JSON_EXPLORER_WEB_STORE_ID } = {},
  {
    runtime = globalThis.chrome?.runtime,
    tabs = globalThis.chrome?.tabs,
    windowObject = globalThis.window,
    randomUUID = () => globalThis.crypto.randomUUID(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = {},
) {
  const responseTimeoutFor = (request) => request.type === 'ping'
    ? AVAILABILITY_TIMEOUT_MS
    : OPEN_RESPONSE_TIMEOUT_MS;

  const sendPageRequest = (request) => new Promise((resolve, reject) => {
    if (!windowObject?.postMessage || !windowObject?.addEventListener) {
      reject(new AzJsonExplorerError('NOT_AVAILABLE', 'AZ JSON Explorer is not available.'));
      return;
    }

    const timeout = setTimeoutFn(() => {
      windowObject.removeEventListener('message', handleMessage);
      reject(new AzJsonExplorerError('NOT_AVAILABLE', 'AZ JSON Explorer is not available.'));
    }, responseTimeoutFor(request));
    function handleMessage(event) {
      const response = event.data;
      if (
        event.source !== windowObject ||
        response?.channel !== CHANNEL ||
        response?.version !== VERSION ||
        response?.requestId !== request.requestId ||
        typeof response?.ok !== 'boolean'
      ) {
        return;
      }
      clearTimeoutFn(timeout);
      windowObject.removeEventListener('message', handleMessage);
      resolve(response);
    }

    windowObject.addEventListener('message', handleMessage);
    const origin = windowObject.location?.origin;
    windowObject.postMessage(request, origin && origin !== 'null' ? origin : '*');
  });

  const sendRuntimeRequest = (request) => new Promise((resolve, reject) => {
    const timeout = setTimeoutFn(() => {
      reject(new AzJsonExplorerError('NOT_AVAILABLE', 'AZ JSON Explorer is not available.'));
    }, responseTimeoutFor(request));

    Promise.resolve()
      .then(() => runtime.sendMessage(extensionId, request))
      .then(
        (response) => {
          clearTimeoutFn(timeout);
          resolve(response);
        },
        (error) => {
          clearTimeoutFn(timeout);
          reject(error);
        },
      );
  });

  const sendRequest = async (request) => {
    try {
      let response;
      if (runtime?.id && typeof runtime.sendMessage === 'function') {
        response = await sendRuntimeRequest(request);
      } else {
        response = await sendPageRequest(request);
      }
      return assertMatchingResponse(request, response);
    } catch (error) {
      if (error instanceof AzJsonExplorerError) {
        throw error;
      }
      throw new AzJsonExplorerError(
        'NOT_AVAILABLE',
        error instanceof Error ? error.message : 'AZ JSON Explorer is not available.',
      );
    }
  };

  const openText = async (jsonText, { sourceLabel } = {}) => {
    if (typeof jsonText !== 'string') {
      throw new AzJsonExplorerError('INVALID_REQUEST', 'JSON text must be a string.');
    }
    if (sourceLabel !== undefined && typeof sourceLabel !== 'string') {
      throw new AzJsonExplorerError('INVALID_REQUEST', 'The source label must be text.');
    }
    const fields = { jsonText };
    if (sourceLabel !== undefined) {
      fields.sourceLabel = sourceLabel;
    }
    return assertSuccessfulResponse(
      await sendRequest(createRequest('open', randomUUID(), fields)),
    );
  };

  const openInstallPage = async () => {
    try {
      if (typeof tabs?.create === 'function') {
        await tabs.create({
          active: true,
          url: AZ_JSON_EXPLORER_STORE_URL,
        });
      } else if (typeof windowObject?.open === 'function') {
        const installWindow = windowObject.open(AZ_JSON_EXPLORER_STORE_URL, '_blank');
        if (!installWindow) {
          throw new AzJsonExplorerError(
            'OPEN_FAILED',
            'The browser blocked the AZ JSON Explorer store page.',
          );
        }
        try {
          installWindow.opener = null;
        } catch {
          // The store page is already open; severing the opener is best effort.
        }
      } else {
        throw new AzJsonExplorerError(
          'OPEN_FAILED',
          'This context cannot open the AZ JSON Explorer store page.',
        );
      }
    } catch (error) {
      if (error instanceof AzJsonExplorerError) {
        throw error;
      }
      throw new AzJsonExplorerError(
        'OPEN_FAILED',
        error instanceof Error ? error.message : 'Failed to open the store page.',
      );
    }

    return {
      opened: true,
      url: AZ_JSON_EXPLORER_STORE_URL,
    };
  };

  return {
    async isAvailable() {
      try {
        const response = await sendRequest(createRequest('ping', randomUUID()));
        return response?.ok === true && response?.result?.available === true;
      } catch {
        return false;
      }
    },
    async open(value, options) {
      let jsonText;
      try {
        jsonText = JSON.stringify(value);
      } catch (error) {
        throw new AzJsonExplorerError(
          'INVALID_REQUEST',
          error instanceof Error ? error.message : 'Value is not JSON serializable.',
        );
      }
      if (typeof jsonText !== 'string') {
        throw new AzJsonExplorerError('INVALID_REQUEST', 'Value is not JSON serializable.');
      }
      return openText(jsonText, options);
    },
    openText,
    openInstallPage,
  };
}
