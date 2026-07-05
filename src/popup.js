document.getElementById('open-viewer').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/viewer.html'),
  });
});
