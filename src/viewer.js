import { mountJsonViewer } from './ui/viewerApp.js';

const params = new URLSearchParams(window.location.search);
const embedded = params.get('embedded') === '1';

const app = mountJsonViewer(document.getElementById('app'), {
  embedded,
  sourceLabel: 'Standalone viewer',
  styleUrl: new URL('./ui/styles.css', import.meta.url).href,
  workerUrl: new URL('./worker/jsonWorker.js', import.meta.url).href,
});

if (embedded) {
  app.setSourceLabel('Waiting for JSON page...');
  window.addEventListener('message', (event) => {
    if (event.data?.source !== 'json-tools-content-script') {
      return;
    }

    if (event.data.type === 'load-json') {
      app.showDirectFileBanner();
      app.setSourceLabel(event.data.sourceLabel || 'JSON page');
      app.parseText(event.data.text);
    }

    if (event.data.type === 'load-json-file') {
      app.showDirectFileBanner();
      app.parseFile(event.data.file, event.data.sourceLabel || 'JSON page');
    }
  });
}
