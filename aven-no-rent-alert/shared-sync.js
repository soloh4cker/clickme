(() => {
  'use strict';

  if (window.top !== window || globalThis.__avenSharedSyncLoaded) return;
  globalThis.__avenSharedSyncLoaded = true;

  let busy = false;

  async function refreshSharedList() {
    if (busy) return;
    busy = true;
    try {
      await chrome.runtime.sendMessage({ type: 'shared-list-refresh' });
    } catch {
      // The alert script keeps using the last cached shared list if the service is temporarily offline.
    } finally {
      busy = false;
    }
  }

  refreshSharedList();
  setInterval(refreshSharedList, 5000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshSharedList();
  });

  window.addEventListener('focus', refreshSharedList);
})();
