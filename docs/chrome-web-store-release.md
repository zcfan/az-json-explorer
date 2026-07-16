# Automated Chrome Web Store Release

`npm run release:chrome` performs a full Chrome Web Store release through the official API V2:

1. Refuse to publish a dirty Git worktree.
2. Check that `manifest.json` and `package.json` use the same version.
3. Run `npm test`.
4. Build and verify `dist/az-json-explorer-<version>.zip`.
5. Upload the package and wait for asynchronous processing when necessary.
6. Submit it with `DEFAULT_PUBLISH`, so it goes live automatically after approval.

The command does not update Store Listing, Privacy, or distribution settings. Keep those settings current in the Chrome Web Store Developer Dashboard.

## One-time credential setup

Use a service account rather than a personal OAuth refresh token. Chrome Web Store API V2 supports service accounts specifically for automated publishing.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Chrome Web Store API** in that project.
3. Create a service account under **IAM & Admin > Service Accounts**. It does not need a Google Cloud project role just to call the Chrome Web Store API.
4. Copy its service account email.
5. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/), open **Account**, and add that service account email under the service account section. Chrome currently permits one service account per publisher.
6. In Google Cloud, open the service account, choose **Keys > Add key > Create new key > JSON**, and download the credential file.
7. Move the JSON file outside this repository and restrict its permissions:

   ```bash
   mkdir -p ~/.config/az-json-explorer
   mv ~/Downloads/YOUR_KEY_FILE.json ~/.config/az-json-explorer/chrome-web-store-service-account.json
   chmod 600 ~/.config/az-json-explorer/chrome-web-store-service-account.json
   ```

Do not commit, paste, or upload the JSON key. If it is exposed, disable that key in Google Cloud immediately and create a replacement.

Official setup reference: [Use a service account with the Chrome Web Store API](https://developer.chrome.com/docs/webstore/service-accounts).

## Configure the command

Find the publisher ID in Developer Dashboard under **Publisher > Settings**. The extension ID is the 32-character item ID; for AZ JSON Explorer it is `logkfmmknmmkpflgamhddeaedneaankj`.

Export these values in the terminal that will run the release:

```bash
export CWS_PUBLISHER_ID='YOUR_PUBLISHER_ID'
export CWS_EXTENSION_ID='logkfmmknmmkpflgamhddeaedneaankj'
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/az-json-explorer/chrome-web-store-service-account.json"
```

The first two values identify the store item and are not credentials. `GOOGLE_APPLICATION_CREDENTIALS` points to the secret service account key and must stay outside the repository.

Run a local package-only rehearsal first. This performs tests and ZIP verification but does not require credentials or call Google:

```bash
npm run release:chrome -- --dry-run
```

When the worktree is clean and the version has been incremented, release it:

```bash
npm run release:chrome
```

The command stops on test, packaging, authentication, upload, or submission failures. A successful submission may still remain under Chrome Web Store review before it becomes public.

## Short-lived token alternative

The script also accepts `CWS_ACCESS_TOKEN` instead of a JSON credential file. This is useful when another CI authentication step already produces a short-lived token with the `https://www.googleapis.com/auth/chromewebstore` scope:

```bash
export CWS_ACCESS_TOKEN='SHORT_LIVED_ACCESS_TOKEN'
npm run release:chrome
```

When both are set, `CWS_ACCESS_TOKEN` takes precedence. Never store an access token in the repository.

API reference: [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).
