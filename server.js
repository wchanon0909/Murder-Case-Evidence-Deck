const express = require('express');
const path = require('path');

const app = express();
const publicDirectory = path.join(__dirname, 'public');
const sourceDirectory = path.join(__dirname, 'src');
const assetDirectory = path.join(publicDirectory, 'assets');
const port = Number.parseInt(process.env.PORT, 10) || 3000;

app.disable('x-powered-by');

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'murder-case-evidence-deck',
    timestamp: new Date().toISOString(),
  });
});

// The shared case/rules modules use a small UMD wrapper so the same source can
// power both browser play and the Node rule checker.
app.use('/src', express.static(sourceDirectory, { index: false }));
app.use('/assets', express.static(assetDirectory, { index: false, maxAge: '7d' }));
app.get('/og.jpg', (_request, response) => {
  response.sendFile(path.join(publicDirectory, 'og.jpg'), { maxAge: 7 * 24 * 60 * 60 * 1000 });
});
app.use(express.static(publicDirectory, {
  maxAge: '1h',
  setHeaders(response, filePath) {
    if (path.basename(filePath) === 'index.html') response.setHeader('Cache-Control', 'no-cache');
  },
}));

app.use('/api', (_request, response) => {
  response.status(404).json({ ok: false, error: 'API route not found' });
});

// The client is a single-page application, so browser refreshes on client routes
// should still return the game shell. Missing asset files remain proper 404s.
app.get('*', (request, response, next) => {
  if (path.extname(request.path)) {
    next();
    return;
  }

  response.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((_request, response) => {
  response.status(404).type('text').send('Not found');
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Murder Case: Evidence Deck is running on port ${port}`);
  });
}

module.exports = app;
