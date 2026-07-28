# Aven No-Rent Alert v2.0.0

A Chrome extension that watches Aven/SynXis for the displayed guest name and warns staff when it matches the hotel's shared no-rent list. It does not click, disable, or alter any Aven control.

## Version 2 shared storage

Version 2 connects to a loopback-only service at `http://127.0.0.1:17831`. The service keeps one master database under:

`C:\ProgramData\DaysInn\AvenNoRentAlert\Data`

Every Windows login on the same physical front-desk computer can use the same list. Chrome keeps a local cached copy for warning checks if the service is temporarily unavailable, but add/edit/delete actions require the service to be online.

## Install

Follow the root guide:

`SETUP_VERSION_2_SHARED_STORAGE.md`

The one-click administrator installer copies the common extension to:

`C:\ProgramData\DaysInn\AvenNoRentAlert\Extension`

Load that folder once from `chrome://extensions` under every front-desk Windows login.

## Guest-name detection

The extension checks several selectors, including:

```css
#gsr-profile h4.primary-guest-info__label-ellipsis
#gsr-profile > div > div > section > div > h4
h4.primary-guest-info__label-ellipsis
.primary-guest-info__label-ellipsis
```

It also detects names inside Aven frames and relays them to the top page so the warning is not hidden inside an iframe.

## Matching

A saved first name `Andrew` and last name `Forbes` matches:

- `Forbes, Andrew`
- `Andrew, Forbes`
- `Forbes Andrew`
- `ANDREW FORBES`

Matching is case-insensitive, punctuation-insensitive, and independent of first/last-name order.

## Data management

The popup supports:

- Add
- Edit
- Delete
- Search
- Reason
- Past confirmation number
- JSON export backup
- JSON import/replace
- Shared service ONLINE/OFFLINE status

The service keeps up to 50 automatic database backups.

## Supported Aven domains

- `https://*.synxis.com/*`
- `https://*.avenhospitality.com/*`

## Limitation

Version 2 shares the list among Windows logins on one physical computer. It does not share the list with a second computer. A multi-computer setup requires a secured network or cloud database.

Keep reasons factual and limited to information needed by authorized hotel staff. Protect exported backups because they may contain guest incident information.
