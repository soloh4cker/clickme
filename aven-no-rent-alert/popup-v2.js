(() => {
  'use strict';

  const CACHE_KEY = 'noRentGuests';
  const STATUS_KEY = 'sharedServiceStatus';
  const $ = id => document.getElementById(id);
  const elements = {
    form: $('guestForm'), editId: $('editId'), first: $('firstName'), last: $('lastName'),
    reason: $('reason'), confirmation: $('confirmationNumber'), save: $('saveButton'),
    cancel: $('cancelEdit'), title: $('formTitle'), search: $('search'), list: $('list'),
    count: $('count'), empty: $('empty'), exportButton: $('exportButton'),
    importButton: $('importButton'), importFile: $('importFile'), status: $('status'),
    sharedStorageStatus: $('sharedStorageStatus'), pageDomain: $('pageDomain'),
    detectedGuest: $('detectedGuest'), matchResult: $('matchResult'),
    checkPage: $('checkPage'), diagnosticHelp: $('diagnosticHelp')
  };

  let guests = [];
  let serviceStatus = { online: false, error: 'Not checked yet.' };
  let busy = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalize = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();

  function showMessage(text, type = '') {
    elements.status.textContent = text;
    elements.status.className = `status ${type}`.trim();
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => {
      elements.status.textContent = '';
      elements.status.className = 'status';
    }, 4000);
  }

  function setBusy(value) {
    busy = value;
    elements.save.disabled = value;
    elements.importButton.disabled = value;
  }

  function sortGuests() {
    guests.sort((a, b) =>
      clean(a.lastName).localeCompare(clean(b.lastName), undefined, { sensitivity: 'base' }) ||
      clean(a.firstName).localeCompare(clean(b.firstName), undefined, { sensitivity: 'base' })
    );
  }

  function renderServiceStatus() {
    if (serviceStatus?.online) {
      const version = clean(serviceStatus.serviceVersion) || 'Unknown';
      elements.sharedStorageStatus.textContent =
        `Shared storage: ONLINE · Version ${version} · ${guests.length} guest${guests.length === 1 ? '' : 's'}`;
      elements.sharedStorageStatus.className = 'diagnostic-line service-online';
    } else {
      elements.sharedStorageStatus.textContent =
        `Shared storage: OFFLINE · ${clean(serviceStatus?.error) || 'Service is unavailable.'}`;
      elements.sharedStorageStatus.className = 'diagnostic-line service-offline';
    }
  }

  function applySharedResponse(response) {
    if (Array.isArray(response?.guests)) guests = response.guests;
    if (response?.status) serviceStatus = response.status;
    sortGuests();
    render();
    renderServiceStatus();
  }

  async function sendExtensionMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      return { ok: false, online: false, error: error.message || 'Extension communication failed.' };
    }
  }

  async function loadSharedList(showError = false) {
    const response = await sendExtensionMessage({ type: 'shared-list-get' });
    applySharedResponse(response);
    if (!response?.ok && showError) {
      showMessage(response?.error || 'Shared storage is offline.', 'error');
    }
    return response;
  }

  async function runMutation(message, successText) {
    if (busy) return null;
    setBusy(true);
    try {
      const response = await sendExtensionMessage(message);
      applySharedResponse(response);
      if (!response?.ok) {
        showMessage(response?.error || 'The shared list could not be updated.', 'error');
        return null;
      }
      showMessage(successText, 'success');
      return response;
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    elements.form.reset();
    elements.editId.value = '';
    elements.title.textContent = 'Add guest';
    elements.save.textContent = 'Add to shared no-rent list';
    elements.cancel.classList.add('hidden');
  }

  function beginEdit(guest) {
    elements.editId.value = clean(guest.id);
    elements.first.value = clean(guest.firstName);
    elements.last.value = clean(guest.lastName);
    elements.reason.value = clean(guest.reason);
    elements.confirmation.value = clean(guest.confirmationNumber);
    elements.title.textContent = 'Edit guest';
    elements.save.textContent = 'Save shared changes';
    elements.cancel.classList.remove('hidden');
    document.documentElement.scrollTop = 0;
  }

  function createButton(text, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.className = className;
    button.addEventListener('click', handler);
    return button;
  }

  function render() {
    const query = normalize(elements.search.value);
    const filtered = guests.filter(guest =>
      !query || [guest.firstName, guest.lastName, guest.reason, guest.confirmationNumber]
        .some(value => normalize(value).includes(query))
    );

    elements.list.replaceChildren();
    elements.count.textContent = String(guests.length);
    elements.empty.classList.toggle('hidden', filtered.length > 0);
    elements.empty.textContent = guests.length && filtered.length === 0
      ? 'No shared guest matches your search.'
      : 'No guests have been added yet.';

    for (const guest of filtered) {
      const card = document.createElement('article');
      card.className = 'card';
      const header = document.createElement('div');
      header.className = 'card-head';
      const name = document.createElement('p');
      name.className = 'name';
      name.textContent = `${clean(guest.lastName)}, ${clean(guest.firstName)}`;
      const actions = document.createElement('div');
      actions.className = 'actions';

      actions.append(
        createButton('Edit', 'small', () => beginEdit(guest)),
        createButton('Delete', 'small delete', async () => {
          if (!confirm(`Remove ${guest.firstName} ${guest.lastName} from the shared no-rent list?`)) return;
          const response = await runMutation(
            { type: 'shared-list-delete', id: guest.id },
            'Guest removed from the shared list.'
          );
          if (response && elements.editId.value === guest.id) resetForm();
        })
      );

      header.append(name, actions);
      const details = document.createElement('p');
      details.className = 'details';
      details.textContent =
        `Reason: ${clean(guest.reason) || 'Not provided'}\n` +
        `Confirmation #: ${clean(guest.confirmationNumber) || 'Not provided'}`;
      details.style.whiteSpace = 'pre-line';
      card.append(header, details);
      elements.list.append(card);
    }
  }

  async function sendDiagnostic(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'aven-diagnostic' }, { frameId: 0 });
    } catch {
      return null;
    }
  }

  async function injectDetector(tabId) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['content.css'] });
    } catch {}

    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['shared-sync.js', 'content.js']
      });
      return true;
    } catch (error) {
      console.error('Detector injection failed:', error);
      return false;
    }
  }

  async function checkCurrentPage(showCheckingText = true) {
    await loadSharedList(false);

    if (showCheckingText) {
      elements.pageDomain.textContent = 'Checking the current tab...';
      elements.detectedGuest.textContent = '';
      elements.matchResult.textContent = '';
      elements.diagnosticHelp.textContent = '';
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active Chrome tab was found.');

      let host = 'Unknown page';
      try { host = new URL(tab.url).host || tab.url; } catch { host = tab.url || host; }
      elements.pageDomain.textContent = `Current page: ${host}`;

      let result = await sendDiagnostic(tab.id);
      if (!result?.loaded) {
        const injected = await injectDetector(tab.id);
        if (injected) {
          await new Promise(resolve => setTimeout(resolve, 700));
          result = await sendDiagnostic(tab.id);
        }
      }

      if (!result?.loaded) {
        elements.detectedGuest.textContent = 'Aven detector: Not running on this tab';
        elements.matchResult.textContent = '';
        elements.diagnosticHelp.textContent =
          'Reload the Aven tab, then check again. The website domain may also be outside the extension permission list.';
        return;
      }

      elements.detectedGuest.textContent = result.guestName
        ? `Detected Aven guest: ${result.guestName}`
        : 'Aven detector is running, but no guest name is currently visible.';

      if (!result.guestName) {
        elements.matchResult.textContent = `Shared records available to this session: ${result.savedGuestCount}`;
        elements.diagnosticHelp.textContent = 'Open a reservation and check again.';
      } else if (result.matchCount > 0) {
        elements.matchResult.textContent =
          `Match result: ${result.matchCount} no-rent match${result.matchCount === 1 ? '' : 'es'} found`;
        elements.diagnosticHelp.textContent =
          'Close this extension menu to view the red warning on the Aven page.';
      } else {
        elements.matchResult.textContent = 'Match result: No shared record matched this name';
        elements.diagnosticHelp.textContent =
          'Check the saved first and last names below. Order and capitalization do not matter.';
      }
    } catch (error) {
      elements.pageDomain.textContent = 'Could not test the current page.';
      elements.detectedGuest.textContent = '';
      elements.matchResult.textContent = '';
      elements.diagnosticHelp.textContent = error.message || 'Unknown diagnostic error.';
    }
  }

  elements.form.addEventListener('submit', async event => {
    event.preventDefault();
    const firstName = clean(elements.first.value);
    const lastName = clean(elements.last.value);
    const guest = {
      firstName,
      lastName,
      reason: clean(elements.reason.value),
      confirmationNumber: clean(elements.confirmation.value)
    };

    if (!firstName || !lastName) {
      showMessage('First and last name are required.', 'error');
      return;
    }

    const id = elements.editId.value;
    let response;
    if (id) {
      response = await runMutation({ type: 'shared-list-update', id, guest }, 'Shared changes saved.');
    } else {
      const duplicate = guests.some(item =>
        normalize(item.firstName) === normalize(firstName) &&
        normalize(item.lastName) === normalize(lastName)
      );
      if (duplicate && !confirm('A guest with the same name already exists. Add another entry anyway?')) return;
      response = await runMutation(
        { type: 'shared-list-create', guest },
        'Guest added to the shared no-rent list.'
      );
    }

    if (response) resetForm();
  });

  elements.cancel.addEventListener('click', resetForm);
  elements.search.addEventListener('input', render);
  elements.checkPage.addEventListener('click', () => checkCurrentPage(true));

  elements.exportButton.addEventListener('click', () => {
    const blob = new Blob([
      JSON.stringify({
        format: 'aven-no-rent-shared-backup',
        version: 2,
        exportedAt: new Date().toISOString(),
        guests
      }, null, 2)
    ], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aven-no-rent-shared-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  elements.importButton.addEventListener('click', () => {
    elements.importFile.value = '';
    elements.importFile.click();
  });

  elements.importFile.addEventListener('change', async () => {
    try {
      const file = elements.importFile.files?.[0];
      if (!file) return;
      const parsed = JSON.parse(await file.text());
      const imported = Array.isArray(parsed) ? parsed : parsed.guests;
      if (!Array.isArray(imported)) throw new Error('No guest list was found in this backup.');
      const cleaned = imported.map(item => ({
        id: clean(item.id),
        firstName: clean(item.firstName),
        lastName: clean(item.lastName),
        reason: clean(item.reason),
        confirmationNumber: clean(item.confirmationNumber),
        createdAt: clean(item.createdAt),
        updatedAt: clean(item.updatedAt)
      })).filter(item => item.firstName && item.lastName);

      if (!confirm(`Import ${cleaned.length} guest(s)? This replaces the entire shared list for every Windows login.`)) return;
      const response = await runMutation(
        { type: 'shared-list-replace', guests: cleaned },
        'Shared backup imported.'
      );
      if (response) resetForm();
    } catch (error) {
      showMessage(error.message || 'Import failed.', 'error');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[CACHE_KEY]) {
      guests = Array.isArray(changes[CACHE_KEY].newValue) ? changes[CACHE_KEY].newValue : [];
      sortGuests();
      render();
    }
    if (changes[STATUS_KEY]) {
      serviceStatus = changes[STATUS_KEY].newValue || { online: false, error: 'Unknown status.' };
      renderServiceStatus();
    }
  });

  loadSharedList(false).then(() => checkCurrentPage(true));
})();
