const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const UrjaClient = require('./urjaClient');

function createRouter(client = new UrjaClient()) {
  const router = express.Router();
  const openapiSpec = require(path.join(__dirname, '..', 'openapi.json'));

  router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  router.get('/openapi.json', (req, res) => {
    res.json(openapiSpec);
  });

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  router.get('/api/v1/meters', async (req, res, next) => {
    try {
      const query = req.query.q || '';
      const page = parseInt(req.query.page, 10) || 1;

      if (req.query.page && isNaN(parseInt(req.query.page, 10))) {
        return res.status(400).json({ error: 'Page parameter must be an integer' });
      }

      const result = await client.getMeters(query, page);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/v1/meters/:id', async (req, res, next) => {
    try {
      const meterId = req.params.id;
      if (!meterId || meterId.trim() === '') {
        return res.status(400).json({ error: 'Meter ID is required' });
      }

      const detail = await client.getMeterDetail(meterId);
      if (!detail) {
        return res.status(404).json({ error: 'Meter not found' });
      }

      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/v1/meters/:id/consumption', async (req, res, next) => {
    try {
      const meterId = req.params.id;
      if (!meterId || meterId.trim() === '') {
        return res.status(400).json({ error: 'Meter ID is required' });
      }

      const consumption = await client.getMeterConsumption(meterId);
      if (!consumption) {
        return res.status(404).json({ error: 'Meter not found' });
      }

      res.json(consumption);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/v1/hierarchy', async (req, res, next) => {
    try {
      const hierarchy = await client.getDistributionTransformers();
      res.json(hierarchy);
    } catch (err) {
      next(err);
    }
  });

  router.use((err, req, res, next) => {
    const statusCode = err.status || 500;
    if (statusCode === 401) {
      return res.status(401).json({ error: 'Authentication failed against upstream portal' });
    }
    if (statusCode === 404) {
      return res.status(404).json({ error: err.message || 'Resource not found' });
    }
    if (statusCode >= 500 || statusCode >= 400) {
      return res.status(502).json({ error: 'Upstream portal communication failed' });
    }
    res.status(statusCode).json({ error: 'An unexpected error occurred' });
  });

  return router;
}

module.exports = createRouter;
