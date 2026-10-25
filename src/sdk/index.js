const axios = require('axios');

/**
 * Flock Energy Official Client SDK
 * Lightweight, typed client for consuming the Flock Energy REST API.
 */
class FlockEnergyClient {
    /**
     * @param {Object} [options]
     * @param {string} [options.baseUrl='http://localhost:3001'] API Base URL
     * @param {number} [options.timeoutMs=10000] HTTP timeout in ms
     */
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl || 'http://localhost:3001').replace(/\/+$/, '');
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: options.timeoutMs || 10000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'FlockEnergy-Node-SDK/1.0.0'
            }
        });
    }

    /**
     * Check system health and upstream connectivity
     */
    async getHealth() {
        const res = await this.client.get('/api/v1/health');
        return res.data;
    }

    /**
     * Query smart meters with optional search query and pagination
     * @param {Object} [params]
     * @param {string} [params.q]
     * @param {number} [params.page]
     * @param {number} [params.pageSize]
     * @param {boolean} [params.all]
     */
    async getMeters(params = {}) {
        const res = await this.client.get('/api/v1/meters', { params });
        return res.data;
    }

    /**
     * Retrieve diagnostic specifications for a single smart meter
     * @param {string} meterId (e.g., 'J100000')
     */
    async getMeterDetails(meterId) {
        if (!meterId) throw new Error('meterId is required');
        const res = await this.client.get(`/api/v1/meters/${encodeURIComponent(meterId)}`);
        return res.data;
    }

    /**
     * Retrieve 30-minute interval telemetry records and summary statistics
     * @param {string} meterId (e.g., 'J100000')
     */
    async getMeterConsumption(meterId) {
        if (!meterId) throw new Error('meterId is required');
        const res = await this.client.get(`/api/v1/meters/${encodeURIComponent(meterId)}/consumption`);
        return res.data;
    }

    /**
     * Retrieve electrical distribution transformers
     * @param {number} [page=1]
     */
    async getTransformers(page = 1) {
        const res = await this.client.get('/api/v1/transformers', { params: { page } });
        return res.data;
    }

    /**
     * Retrieve complete 7-tier electrical grid hierarchy
     */
    async getHierarchy() {
        const res = await this.client.get('/api/v1/hierarchy');
        return res.data;
    }

    /**
     * Export all 403 meters with rich topology and GPS coordinates
     */
    async exportAll() {
        const res = await this.client.get('/api/v1/export');
        return res.data;
    }
}

module.exports = FlockEnergyClient;
