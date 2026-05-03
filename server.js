// Minimal static file server for the OT Assessment Platform.
// The app is now pure front-end: forms live as JSON files in public/forms/
// (listed by public/forms/index.json). This server just serves the public/
// directory over HTTP — needed because browsers block fetch() under file://.

const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`OT Assessment Platform running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}`);
});
