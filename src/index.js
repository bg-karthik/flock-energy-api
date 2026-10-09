const express = require('express');
const config = require('./config');
const createRouter = require('./routes');

const app = express();

app.use(express.json());
app.use(createRouter());

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Flock Energy API running on port ${config.port}`);
  });
}

module.exports = app;
