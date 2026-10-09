require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  urjaBaseUrl: process.env.URJA_BASE_URL || 'https://urja-ops.flockenergy.tech',
  urjaUsername: process.env.URJA_USERNAME || '',
  urjaPassword: process.env.URJA_PASSWORD || '',
};
