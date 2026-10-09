const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const config = require('./config');

function unflattenDevalue(arr) {
  if (!Array.isArray(arr)) return arr;
  function hydrate(val) {
    if (typeof val === 'number') return hydrate(arr[val]);
    if (Array.isArray(val)) return val.map(hydrate);
    if (val && typeof val === 'object') {
      const res = {};
      for (const [k, v] of Object.entries(val)) {
        res[k] = hydrate(v);
      }
      return res;
    }
    return val;
  }
  return hydrate(arr[0]);
}

class UrjaClient {
  constructor(customConfig = {}) {
    this.baseUrl = customConfig.urjaBaseUrl || config.urjaBaseUrl;
    this.username = customConfig.urjaUsername || config.urjaUsername;
    this.password = customConfig.urjaPassword || config.urjaPassword;

    this.cookieJar = new CookieJar();
    this.client = axios.create({
      baseURL: this.baseUrl,
      withCredentials: true,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 500,
      headers: {
        'User-Agent': 'UrjaApiClient/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    this.client.interceptors.request.use(async (reqConfig) => {
      const targetUrl = (reqConfig.baseURL || '') + (reqConfig.url || '');
      const cookieString = await this.cookieJar.getCookieString(targetUrl);
      if (cookieString) {
        reqConfig.headers.Cookie = cookieString;
      }
      return reqConfig;
    });

    this.client.interceptors.response.use(async (response) => {
      const setCookies = response.headers['set-cookie'];
      if (setCookies) {
        const targetUrl = (response.config.baseURL || '') + (response.config.url || '');
        const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
        for (const cookie of cookies) {
          try {
            await this.cookieJar.setCookie(cookie, targetUrl);
          } catch (e) {
          }
        }
      }
      return response;
    });

    this.isAuthenticated = false;
  }

  async login() {
    const body = new URLSearchParams({
      email: this.username,
      password: this.password
    }).toString();

    const response = await this.client.post('/login', body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': this.baseUrl
      }
    });

    if (response.status !== 200 && response.status !== 303 && response.status !== 302) {
      this.isAuthenticated = false;
      const error = new Error('Authentication failed against Urja portal');
      error.status = 401;
      throw error;
    }

    if (response.data && response.data.error) {
      this.isAuthenticated = false;
      const error = new Error('Authentication failed: ' + response.data.error);
      error.status = 401;
      throw error;
    }

    this.isAuthenticated = true;
  }

  async executeWithAuth(requestFn) {
    if (!this.isAuthenticated) {
      await this.login();
    }

    let response = await requestFn();

    const isSessionExpired =
      response.status === 401 ||
      (response.status === 302 && response.headers.location && response.headers.location.includes('/login')) ||
      (typeof response.data === 'string' && response.data.includes('Redirecting to /login'));

    if (isSessionExpired) {
      this.isAuthenticated = false;
      await this.login();
      response = await requestFn();
    }

    return response;
  }

  async getMeters(query = '', page = 1) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const searchParam = encodeURIComponent(query || '');

    const response = await this.executeWithAuth(() =>
      this.client.get(`/portal/meters/search?q=${searchParam}&page=${pageNum}`)
    );

    if (response.status >= 400) {
      const error = new Error('Failed to retrieve meters from portal');
      error.status = response.status;
      throw error;
    }

    const data = response.data || {};
    const items = data.data || [];
    const total = typeof data.total === 'number' ? data.total : items.length;
    const pageSize = typeof data.pageSize === 'number' ? data.pageSize : 20;

    return {
      data: items,
      pagination: {
        total,
        page: pageNum,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 1
      }
    };
  }

  async getMeterGeo(meterId) {
    const response = await this.executeWithAuth(() =>
      this.client.get(`/portal/meters/${encodeURIComponent(meterId)}/geo`)
    );

    if (response.status === 200 && response.data && response.data.data) {
      return response.data.data;
    }
    return null;
  }

  async getMeterDetail(meterId) {
    const response = await this.executeWithAuth(() =>
      this.client.get(`/meters/${encodeURIComponent(meterId)}/__data.json`, {
        headers: {
          'x-sveltekit-invalidated': '010'
        }
      })
    );

    if (response.status === 404) {
      return null;
    }

    const body = response.data;
    if (!body || !Array.isArray(body.nodes)) {
      return null;
    }

    const detailNode = body.nodes[2];
    if (!detailNode) {
      return null;
    }

    if (detailNode.type === 'error' || detailNode.status === 404) {
      return null;
    }

    let hydratedData = null;
    if (detailNode.data) {
      hydratedData = unflattenDevalue(detailNode.data);
    }

    if (!hydratedData) {
      return null;
    }

    const parameters = {};
    if (hydratedData.detail && Array.isArray(hydratedData.detail.data)) {
      for (const item of hydratedData.detail.data) {
        if (item.parameterName && item.parameterValue !== undefined) {
          parameters[item.parameterName] = item.parameterValue;
        }
      }
    }

    const hierarchyData = hydratedData.hierarchy || {};
    const geo = await this.getMeterGeo(meterId);

    return {
      meterId: hydratedData.meterId || meterId,
      serialNo: parameters['Serial No'] || null,
      make: parameters['Make'] || null,
      phaseType: parameters['Phase Type'] || null,
      installStatus: parameters['Installation Status'] || null,
      installationType: parameters['Installation Type'] || null,
      location: geo || null,
      hierarchy: {
        zone: hierarchyData['Zone'] || null,
        circle: hierarchyData['Circle'] || null,
        division: hierarchyData['Division'] || null,
        subdivision: hierarchyData['Subdivision'] || null,
        substation: hierarchyData['Sub Station'] || null,
        feeder: hierarchyData['Feeder'] || null,
        dt: hierarchyData['DT'] || null
      }
    };
  }

  async getMeterConsumption(meterId) {
    const response = await this.executeWithAuth(() =>
      this.client.get(`/portal/meters/${encodeURIComponent(meterId)}/energy`)
    );

    if (response.status === 404) {
      return null;
    }

    if (response.status >= 400) {
      const error = new Error('Failed to retrieve meter consumption');
      error.status = response.status;
      throw error;
    }

    const rawList = (response.data && response.data.data) || [];
    const readings = rawList.map(item => ({
      timestamp: item.timestamp,
      kwh: parseFloat(item.kwh) || 0,
      kvah: parseFloat(item.kvah) || 0,
      voltageR: parseFloat(item.voltR) || 0
    }));

    return {
      meterId,
      totalReadings: readings.length,
      readings
    };
  }

  async getDistributionTransformers() {
    const response = await this.executeWithAuth(() =>
      this.client.get('/portal/dts')
    );

    if (response.status >= 400) {
      const error = new Error('Failed to retrieve distribution transformers');
      error.status = response.status;
      throw error;
    }

    const items = (response.data && response.data.data) || [];
    return {
      transformers: items
    };
  }
}

module.exports = UrjaClient;
