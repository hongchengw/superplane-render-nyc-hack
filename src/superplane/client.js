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

    const data = await res.json();
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

  async listCanvases() {
    return this.get('/canvases');
  }

  async createCanvas(name, spec) {
    return this.post('/canvases', {
      canvas: {
        metadata: { name },
        spec,
      },
    });
  }

  async getCanvas(canvasId) {
    return this.get(`/canvases/${canvasId}`);
  }

  async updateCanvas(canvasId, name, description) {
    return this.put(`/canvases/${canvasId}`, { name, description });
  }

  async deleteCanvas(canvasId) {
    return this.delete(`/canvases/${canvasId}`);
  }

  async listRuns(canvasId) {
    return this.get(`/canvases/${canvasId}/runs`);
  }

  async getRun(canvasId, runId) {
    return this.get(`/canvases/${canvasId}/runs/${runId}`);
  }

  async listNodeExecutions(canvasId, nodeId) {
    return this.get(`/canvases/${canvasId}/nodes/${nodeId}/executions`);
  }

  async triggerCanvas(canvasId, triggerId, parameters = {}) {
    return this.post(
      `/canvases/${canvasId}/triggers/${triggerId}/hooks/run`,
      { parameters }
    );
  }

  async createSecret(name, value) {
    return this.post('/secrets', { name, value });
  }

  async listSecrets() {
    return this.get('/secrets');
  }

  async getMe() {
    return this.get('/me');
  }

  async listIntegrations() {
    return this.get('/integrations');
  }
}
