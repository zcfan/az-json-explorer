export const VERSION_UPDATE_NOTICE_STORAGE_KEY =
  'json-tools.last-version-update-notice';

export function claimVersionUpdateNotice(storage, currentVersion) {
  if (!storage || !currentVersion) {
    return false;
  }

  try {
    if (storage.getItem(VERSION_UPDATE_NOTICE_STORAGE_KEY) === currentVersion) {
      return false;
    }

    storage.setItem(VERSION_UPDATE_NOTICE_STORAGE_KEY, currentVersion);
    return true;
  } catch {
    return false;
  }
}
