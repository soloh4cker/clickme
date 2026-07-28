(() => {
  'use strict';

  const SERVICE_BASE = 'http://127.0.0.1:17831';
  const CACHE_KEY = 'noRentGuests';
  const STATUS_KEY = 'sharedServiceStatus';
  const MIGRATION_KEY = 'sharedStorageMigrationComplete';
  const PRE_MIGRATION_BACKUP_KEY = 'preSharedMigrationNoRentGuests';
  let refreshPromise = null;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function cleanGuest(input = {}) {
    return {
      id: clean(input.id),
      firstName: clean(input.firstName),
      lastName: clean(input.lastName),
      reason: clean(input.reason),
      confirmationNumber: clean(input.confirmationNumber),
      createdAt: clean(input.createdAt),
      updatedAt: clean(input.updatedAt)
    };
  }

  async function serviceRequest(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${SERVICE_BASE}${path}`, {
        ...options,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Aven-NoRent-Client': 'chrome-extension-v2',
          ...(options.headers || {})
        }
      });

      let body = null;
      try { body = await response.json(); } catch {}

      if (!response.ok) {
        throw new Error(body?.error || `Shared service returned HTTP ${response.status}.`);
      }
      return body || {};
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Shared storage did not answer within 4 seconds.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function setOnlineCache(serverData) {
    const guests = Array.isArray(serverData.guests)
      ? serverData.guests.map(cleanGuest).filter(guest => guest.firstName && guest.lastName)
      : [];

    const status = {
      online: true,
      serviceVersion: clean(serverData.serviceVersion) || 'Unknown',
      guestCount: guests.length,
      updatedAt: clean(serverData.updatedAt),
      lastCheckedAt: new Date().toISOString(),
      error: ''
    };

    await chrome.storage.local.set({
      [CACHE_KEY]: guests,
      [STATUS_KEY]: status
    });

    return { ok: true, online: true, guests, status };
  }

  async function setOfflineStatus(error) {
    const stored = await chrome.storage.local.get([CACHE_KEY, STATUS_KEY]);
    const guests = Array.isArray(stored[CACHE_KEY]) ? stored[CACHE_KEY] : [];
    const status = {
      ...(stored[STATUS_KEY] || {}),
      online: false,
      guestCount: guests.length,
      lastCheckedAt: new Date().toISOString(),
      error: error?.message || 'Shared storage is unavailable.'
    };
    await chrome.storage.local.set({ [STATUS_KEY]: status });
    return { ok: false, online: false, guests, status, error: status.error };
  }

  async function refreshSharedList({ allowMigration = true } = {}) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const local = await chrome.storage.local.get([
          CACHE_KEY,
          MIGRATION_KEY,
          PRE_MIGRATION_BACKUP_KEY
        ]);
        const oldLocalGuests = Array.isArray(local[CACHE_KEY])
          ? local[CACHE_KEY].map(cleanGuest).filter(guest => guest.firstName && guest.lastName)
          : [];

        let serverData = await serviceRequest('/guests', { method: 'GET' });
        let serverGuests = Array.isArray(serverData.guests) ? serverData.guests : [];

        if (allowMigration && !local[MIGRATION_KEY]) {
          if (serverGuests.length === 0 && oldLocalGuests.length > 0) {
            await serviceRequest('/replace', {
              method: 'POST',
              body: JSON.stringify({ guests: oldLocalGuests })
            });
            serverData = await serviceRequest('/guests', { method: 'GET' });
            serverGuests = Array.isArray(serverData.guests) ? serverData.guests : [];
          } else if (
            serverGuests.length > 0 &&
            oldLocalGuests.length > 0 &&
            !Array.isArray(local[PRE_MIGRATION_BACKUP_KEY])
          ) {
            await chrome.storage.local.set({
              [PRE_MIGRATION_BACKUP_KEY]: oldLocalGuests
            });
          }

          await chrome.storage.local.set({ [MIGRATION_KEY]: true });
        }

        return await setOnlineCache(serverData);
      } catch (error) {
        console.error('Aven shared storage refresh failed:', error);
        return await setOfflineStatus(error);
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function mutateSharedList(message) {
    try {
      switch (message.type) {
        case 'shared-list-create':
          await serviceRequest('/guests', {
            method: 'POST',
            body: JSON.stringify(cleanGuest(message.guest))
          });
          break;

        case 'shared-list-update': {
          const id = encodeURIComponent(clean(message.id));
          if (!id) throw new Error('Guest ID is required.');
          await serviceRequest(`/guests/${id}`, {
            method: 'PUT',
            body: JSON.stringify(cleanGuest(message.guest))
          });
          break;
        }

        case 'shared-list-delete': {
          const id = encodeURIComponent(clean(message.id));
          if (!id) throw new Error('Guest ID is required.');
          await serviceRequest(`/guests/${id}`, { method: 'DELETE' });
          break;
        }

        case 'shared-list-replace':
          await serviceRequest('/replace', {
            method: 'POST',
            body: JSON.stringify({
              guests: Array.isArray(message.guests)
                ? message.guests.map(cleanGuest)
                : []
            })
          });
          break;

        default:
          throw new Error('Unknown shared-list operation.');
      }

      return await refreshSharedList({ allowMigration: false });
    } catch (error) {
      console.error('Aven shared storage write failed:', error);
      await setOfflineStatus(error);
      return { ok: false, online: false, error: error.message || 'Shared-list update failed.' };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return;

    if (message.type === 'aven-frame-guest-update' && sender.tab?.id) {
      chrome.tabs.sendMessage(
        sender.tab.id,
        {
          type: 'aven-forwarded-guest-update',
          frameId: Number.isInteger(sender.frameId) ? sender.frameId : -1,
          frameUrl: sender.url || '',
          guestName: String(message.guestName || '')
        },
        { frameId: 0 }
      ).catch(() => {});
      return;
    }

    if (message.type === 'shared-list-get' || message.type === 'shared-list-refresh') {
      refreshSharedList().then(sendResponse);
      return true;
    }

    if (
      message.type === 'shared-list-create' ||
      message.type === 'shared-list-update' ||
      message.type === 'shared-list-delete' ||
      message.type === 'shared-list-replace'
    ) {
      mutateSharedList(message).then(sendResponse);
      return true;
    }

    if (message.type === 'shared-service-status') {
      chrome.storage.local.get([CACHE_KEY, STATUS_KEY]).then(result => {
        sendResponse({
          ok: true,
          guests: Array.isArray(result[CACHE_KEY]) ? result[CACHE_KEY] : [],
          status: result[STATUS_KEY] || { online: false, error: 'Not checked yet.' }
        });
      });
      return true;
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    refreshSharedList().catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    refreshSharedList().catch(() => {});
  });
})();
