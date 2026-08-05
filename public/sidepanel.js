(function initSidepanel() {
  try {
    const frame = document.getElementById('frame');
    if (!frame) return;
    const params = new URLSearchParams(window.location.search || '');
    const tabId = Number(params.get('tabId') || 0);
    frame.src = tabId > 0 ? `popup.html?tabId=${tabId}` : 'popup.html';
  } catch (error) {
    console.error('[FillForm] sidepanel init failed', error);
  }
})();
