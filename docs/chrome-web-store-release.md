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

To upload a new package as a dashboard draft without submitting it for review, use:

```bash
npm run release:chrome -- --upload-only
```

This mode still requires a clean worktree, matching incremented versions, passing tests, and valid
credentials. It stops after Chrome finishes processing the ZIP, so Store Listing text and images can
be updated manually before the final dashboard submission.

When the worktree is clean and the version has been incremented, release it:

```bash
npm run release:chrome
```

The command stops on test, packaging, authentication, upload, or submission failures. A successful submission may still remain under Chrome Web Store review before it becomes public.

## Replace a version that is pending review

Chrome Web Store supports cancelling a `PENDING_REVIEW` submission and submitting a newer package. There is no atomic replace operation; cancel the active submission first, then upload and publish the newer version.

For this project, the shortest safe sequence is:

1. Confirm the submitted revision is `PENDING_REVIEW` in the Developer Dashboard or with [`fetchStatus`](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus).
2. In the dashboard, choose **Cancel review**, or call API V2 with an empty request body:

   ```bash
   curl -H "Authorization: Bearer $CWS_ACCESS_TOKEN" -X POST \
     "https://chromewebstore.googleapis.com/v2/publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID:cancelSubmission"
   ```

3. Confirm cancellation succeeded; the dashboard returns the submission to draft. Increment the manifest and package versions, commit the release, then run `npm run release:chrome` to upload and submit the replacement.

For example, cancel `0.1.6`, then submit `0.1.7`. Uploading an update without a higher manifest version fails. Cancellation is limited to six times per publisher per day, so do not retry it blindly.

Official references: [Cancel a review](https://developer.chrome.com/docs/webstore/cancel-review), [`cancelSubmission` API V2](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/cancelSubmission), and [Chrome Web Store API upload/publish flow](https://developer.chrome.com/docs/webstore/using-api).

## Short-lived token alternative

The script also accepts `CWS_ACCESS_TOKEN` instead of a JSON credential file. This is useful when another CI authentication step already produces a short-lived token with the `https://www.googleapis.com/auth/chromewebstore` scope:

```bash
export CWS_ACCESS_TOKEN='SHORT_LIVED_ACCESS_TOKEN'
npm run release:chrome
```

When both are set, `CWS_ACCESS_TOKEN` takes precedence. Never store an access token in the repository.

API reference: [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).
