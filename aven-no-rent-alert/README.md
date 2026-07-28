# Aven No-Rent Alert v1.0.0

A Chrome extension that watches this Aven guest-name element:

```css
.primary-guest-info__label-ellipsis
```

When the displayed guest matches a locally stored no-rent entry, it shows a red warning popup. It does not click, disable, or alter any Aven controls.

## Install

1. Download this branch as a ZIP from GitHub and extract it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `aven-no-rent-alert` folder containing `manifest.json`.
6. Reload any Aven tab that was already open.
7. Pin the extension from Chrome's Extensions menu.

## Use

Click the extension icon and add:

- First name
- Last name
- Reason
- Past confirmation number

Matching is case-insensitive, punctuation-insensitive, and independent of name order. A saved `Andrew` + `Forbes` entry matches `Forbes, Andrew`, `Andrew, Forbes`, `Forbes Andrew`, and `ANDREW FORBES`.

Click the X to dismiss the warning for the currently displayed guest. Opening another guest resets the check. The confirmation number can be copied from the warning.

## Storage

The list is stored in `chrome.storage.local` in the current Chrome profile. It is not automatically shared between computers. Use Export Backup and Import Backup to transfer the list.

The extension has no networking code and does not send the list to an external server.

## Supported domains

The manifest currently runs on:

- `https://*.synxis.com/*`
- `https://*.avenhospitality.com/*`

If the actual Aven address bar uses another domain, add it to the `matches` array in `manifest.json`, then reload the extension from `chrome://extensions`.

## First test

1. Use a test reservation or an authorized record.
2. Add the exact first and last name to the extension.
3. Open that reservation in Aven.
4. Confirm the red warning appears.
5. Test the X and confirmation-number copy button.
6. Open another reservation and return to verify detection runs again.

Keep reasons factual and limited to information needed by authorized hotel staff. Protect exported backups because they may contain guest incident information.
