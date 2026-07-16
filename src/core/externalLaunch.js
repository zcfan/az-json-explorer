export const EXTERNAL_LAUNCH_CHANNEL = 'az-json-explorer';
export const EXTERNAL_LAUNCH_VERSION = 1;
export const EXTERNAL_LAUNCH_CAPABILITIES = ['open', 'open-text'];
export const EXTERNAL_LAUNCH_TIMEOUT_MS = 10_000;
export const EXTERNAL_LAUNCH_RATE_LIMIT_MS = 1_000;
export const INTERNAL_LAUNCH_CLAIM_TYPE = 'claim-external-launch';

function createResponse(request, body) {
  return {
    channel: request.channel ?? EXTERNAL_LAUNCH_CHANNEL,
    version: request.version ?? EXTERNAL_LAUNCH_VERSION,
    requestId: request.requestId,
    ...body,
  };
}

export function createExternalLaunchErrorResponse(request, code, message) {
  return createResponse(request, {
    ok: false,
    error: { code, message },
  });
}

export function createLaunchBroker({
  openTab,
  createLaunchId = () => crypto.randomUUID(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  timeoutMs = EXTERNAL_LAUNCH_TIMEOUT_MS,
  now = Date.now,
  rateLimitMs = EXTERNAL_LAUNCH_RATE_LIMIT_MS,
}) {
  const pendingLaunches = new Map();
  const lastLaunchByCaller = new Map();

  return {
    async handleRequest(request, { callerKey = 'unknown' } = {}) {
      if (
        request?.channel !== EXTERNAL_LAUNCH_CHANNEL ||
        request?.version !== EXTERNAL_LAUNCH_VERSION
      ) {
        return createExternalLaunchErrorResponse(
          request ?? {},
          'UNSUPPORTED_VERSION',
          'Unsupported AZ JSON Explorer protocol version.',
        );
      }
      if (typeof request.requestId !== 'string' || !request.requestId.trim()) {
        return createExternalLaunchErrorResponse(
          request,
          'INVALID_REQUEST',
          'External launch requests require a request id.',
        );
      }

      if (request?.type === 'ping') {
        return createResponse(request, {
          ok: true,
          result: {
            available: true,
            protocolVersion: EXTERNAL_LAUNCH_VERSION,
            capabilities: [...EXTERNAL_LAUNCH_CAPABILITIES],
          },
        });
      }

      if (request?.type !== 'open' || typeof request.jsonText !== 'string') {
        return createExternalLaunchErrorResponse(
          request,
          'INVALID_REQUEST',
          'Open requests must include JSON text.',
        );
      }
      if (request.sourceLabel !== undefined && typeof request.sourceLabel !== 'string') {
        return createExternalLaunchErrorResponse(
          request,
          'INVALID_REQUEST',
          'The source label must be text.',
        );
      }
      const sourceLabel = request.sourceLabel?.trim().slice(0, 200);

      const currentTime = now();
      const lastLaunch = lastLaunchByCaller.get(callerKey);
      if (lastLaunch !== undefined && currentTime - lastLaunch < rateLimitMs) {
        return createExternalLaunchErrorResponse(
          request,
          'RATE_LIMITED',
          'Wait before opening another AZ JSON Explorer tab.',
        );
      }
      lastLaunchByCaller.set(callerKey, currentTime);

      const launchId = createLaunchId();
      let resolveLaunch;
      const responsePromise = new Promise((resolve) => {
        resolveLaunch = resolve;
      });
      const pendingLaunch = {
        jsonText: request.jsonText,
        sourceLabel,
        request,
        resolve: resolveLaunch,
        timer: null,
      };
      pendingLaunches.set(launchId, pendingLaunch);

      try {
        await openTab(launchId);
      } catch (error) {
        pendingLaunches.delete(launchId);
        return createResponse(request, {
          ok: false,
          error: {
            code: 'OPEN_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }

      if (!pendingLaunches.has(launchId)) {
        return responsePromise;
      }

      pendingLaunch.timer = setTimeoutFn(() => {
        if (!pendingLaunches.delete(launchId)) {
          return;
        }
        pendingLaunch.resolve(createResponse(request, {
          ok: false,
          error: {
            code: 'HANDOFF_TIMEOUT',
            message: 'The viewer did not claim the JSON payload in time.',
          },
        }));
      }, timeoutMs);
      return responsePromise;
    },

    claim(launchId) {
      const pendingLaunch = pendingLaunches.get(launchId);
      if (!pendingLaunch) {
        return null;
      }

      pendingLaunches.delete(launchId);
      if (pendingLaunch.timer !== null) {
        clearTimeoutFn(pendingLaunch.timer);
      }
      pendingLaunch.resolve(createResponse(pendingLaunch.request, {
        ok: true,
        result: { opened: true },
      }));
      return {
        jsonText: pendingLaunch.jsonText,
        sourceLabel: pendingLaunch.sourceLabel,
      };
    },
  };
}
