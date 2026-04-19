const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve videos with proper range support (needed for video seeking)
app.use((req, res, next) => {
  if (req.path.match(/\.(mp4|mov|webm)$/)) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
  next();
});

// Serve all static files from /public
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
}));

// All routes serve index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Good Husband Co. running on port ${PORT}`);
});
