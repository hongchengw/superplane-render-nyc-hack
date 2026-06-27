import fetch from 'node-fetch';

const BASE_URL = 'https://app.superplane.com/api/v1';

export class SuperPlaneClient {
  constructor(apiToken) {
    this.token = apiToken;
  }

  async request(method, path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { message: text }; }

    if (!res.ok) {
      throw new Error(`SuperPlane API error ${res.status}: ${data.message || JSON.stringify(data)}`);
    }
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }
  delete(path) { return this.request('DELETE', path); }

  async listCanvases() { return this.get('/canvases'); }

  async createCanvas(name, spec) {
    return this.post('/canvases', { canvas: { metadata: { name }, spec } });
  }

  async updateCanvas(canvasId, name, spec) {
    return this.put(`/canvases/${canvasId}`, { canvas: { metadata: { id: canvasId, name }, spec } });
  }

  async getCanvas(canvasId) { return this.get(`/canvases/${canvasId}`); }

  async listRuns(canvasId) { return this.get(`/canvases/${canvasId}/runs`); }

  async getRun(canvasId, runId) { return this.get(`/canvases/${canvasId}/runs/${runId}`); }

  async listNodeExecutions(canvasId, nodeId) {
    return this.get(`/canvases/${canvasId}/nodes/${nodeId}/executions`);
  }

  // template param is REQUIRED by the start hook to select which template to use
  async triggerCanvas(canvasId, triggerId, userParameters = {}, templateName = 'Build Issue') {
    return this.post(
      `/canvases/${canvasId}/triggers/${triggerId}/hooks/run`,
      { parameters: { template: templateName, ...userParameters } }
    );
  }

  // Correct proto format: metadata.name + spec.provider + spec.local.data
  async createSecret(name, value) {
    return this.post('/secrets', {
      secret: {
        metadata: { name },
        spec: {
          provider: 'PROVIDER_LOCAL',
          local: { data: { value } },
        },
      },
      domainType: 'DOMAIN_TYPE_ORGANIZATION',
    });
  }

  // domainType must be passed as query param for secrets
  async listSecrets() {
    return this.get('/secrets?domainType=DOMAIN_TYPE_ORGANIZATION');
  }

  // Secrets returned as {metadata: {name, id, ...}, spec: {...}}
  async secretExists(name) {
    const { secrets } = await this.listSecrets();
    return (secrets || []).some(s => s.metadata?.name === name || s.name === name);
  }

  // Update a specific key value within an existing secret
  async setSecretKey(nameOrId, keyName, value) {
    return this.put(`/secrets/${nameOrId}/keys/${keyName}`, {
      value,
      domainType: 'DOMAIN_TYPE_ORGANIZATION',
    });
  }

  async getMe() { return this.get('/me'); }

  async listIntegrations() { return this.get('/integrations'); }
}
