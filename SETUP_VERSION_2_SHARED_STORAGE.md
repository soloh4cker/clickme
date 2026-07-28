# Aven No-Rent Alert Version 2 — Shared Storage Setup

Version 2 keeps one master no-rent list for every Windows login on the same front-desk computer.

## Before updating

If Version 1.2 contains any real entries, open it and click **Export backup** before removing it. Version 2 can import that JSON backup into the new shared database.

## What gets installed

The one-click installer creates:

- Shared local service: `C:\ProgramData\DaysInn\AvenNoRentAlert\Service`
- Common extension folder: `C:\ProgramData\DaysInn\AvenNoRentAlert\Extension`
- Shared database and backups: `C:\ProgramData\DaysInn\AvenNoRentAlert\Data`
- Windows scheduled task: `Days Inn Aven No-Rent Shared Service`
- Loopback-only service address: `http://127.0.0.1:17831`

The service starts with Windows under the SYSTEM account and continues running when users sign in or out. It listens only on this computer, not on the hotel network or internet.

## Install the shared service once

1. Download the latest `aven-no-rent-alert-v1` branch ZIP from GitHub.
2. Extract the complete ZIP. Do not run the installer from inside the ZIP preview.
3. Close Chrome on the front-desk computer.
4. Double-click `INSTALL_SHARED_STORAGE_AS_ADMIN.bat`.
5. Click **Yes** when Windows asks for administrator permission.
6. Wait for the message **Shared storage installed successfully**.
7. The installer will show this common extension folder:

   `C:\ProgramData\DaysInn\AvenNoRentAlert\Extension`

If installation reports a failure, do not delete the window message. Take a screenshot of it.

## Install Version 2 for each Windows login

Repeat these steps while signed into every front-desk Windows account:

1. Open Chrome.
2. Enter `chrome://extensions` in the address bar.
3. Turn on **Developer mode**.
4. Remove the old Aven No-Rent Alert extension from that Chrome profile.
5. Click **Load unpacked**.
6. Select:

   `C:\ProgramData\DaysInn\AvenNoRentAlert\Extension`

7. Confirm Chrome shows **Version 2.0.0**.
8. Open Aven and reload it with `Ctrl+R`.
9. Click the extension icon. The top line should say **Shared storage: ONLINE**.

Every Windows login must load the extension once, but the Windows service is installed only once.

## Restore the old list

Do this once under the manager Windows login:

1. Open Version 2.
2. Confirm **Shared storage: ONLINE**.
3. Click **Import backup**.
4. Choose the JSON backup exported from Version 1.2.
5. Confirm the import.

The imported entries immediately become the master list for every Windows login on this computer. Other logged-in Aven sessions refresh the shared list automatically within several seconds.

## Test sharing

1. Under the manager login, add a test guest to Version 2.
2. Sign out or switch to another front-desk Windows login.
3. Open Chrome and the extension.
4. Confirm the same test guest appears.
5. Open the matching Aven reservation and confirm the red warning appears.
6. Delete the test guest after testing.

## Normal operation

- Add, edit, delete, import, and export actions use the shared database.
- Aven pages refresh their cached copy every five seconds and whenever the tab regains focus.
- If the service temporarily stops, existing cached names can still produce warnings, but list changes are blocked until the service is online again.
- The service keeps up to 50 automatic data-file backups.

## Service troubleshooting

Run this file from the extracted download:

`shared-service\Test-SharedStorage.ps1`

Or open the extension and read the **Shared storage** status line.

Windows locations:

- Log: `C:\ProgramData\DaysInn\AvenNoRentAlert\Data\shared-service.log`
- Database: `C:\ProgramData\DaysInn\AvenNoRentAlert\Data\no-rent-list.json`
- Backups: `C:\ProgramData\DaysInn\AvenNoRentAlert\Data\Backups`
- Task Scheduler task: `Days Inn Aven No-Rent Shared Service`

## Important limitation

This design shares data among Windows logins on one physical computer. It does not automatically share the list with a second front-desk computer. A second-computer version would require a secured network or cloud database.
