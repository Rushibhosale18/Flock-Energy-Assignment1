/**
 * Type Definitions for Flock Energy - Urja Meter Ops API
 */

export interface GeoCoordinates {
    latitude: number | null;
    longitude: number | null;
}

export interface MeterHierarchyBreadcrumb {
    zone?: string;
    circle?: string;
    division?: string;
    subdivision?: string;
    substation?: string;
    feeder?: string;
    dt?: string;
}

export interface MeterSummary {
    meter_id: string;
    serial_number: string;
    make: string;
    phase_type: 'single' | 'three';
    install_status: 'Installed' | 'Faulty' | 'Decommissioned' | string;
    install_type?: string | null;
    dt_code: string;
    geo?: GeoCoordinates | null;
    hierarchy?: MeterHierarchyBreadcrumb | null;
}

export interface MeterListResponse {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    data: MeterSummary[];
}

export interface MeterDetail extends MeterSummary {
    raw_attributes: Record<string, string>;
}

export interface ConsumptionReading {
    timestamp: string; // ISO 8601 UTC
    raw_timestamp: string; // DD/MM/YYYY HH:mm
    kwh: number | null;
    kvah: number | null;
    voltage_r: number | null;
}

export interface ConsumptionSummary {
    latest_kwh: number | null;
    latest_kvah: number | null;
    latest_voltage_r: number | null;
    average_voltage_r: number | null;
}

export interface ConsumptionHistoryResponse {
    meter_id: string;
    total_readings: number;
    time_window: {
        start: string | null;
        end: string | null;
    };
    summary: ConsumptionSummary;
    readings: ConsumptionReading[];
}

export interface Transformer {
    code: string;
    name: string;
    feeder_code: string;
    capacity_kva: number;
}

export interface TransformerListResponse {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    data: Transformer[];
}

export interface SystemHealthResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    environment: string;
    service: string;
    version: string;
    upstream: {
        status: string;
        upstream_portal: string;
        latency_ms: number;
        authenticated: boolean;
        session_age_seconds: number | null;
    };
}

export declare class FlockEnergyClient {
    constructor(options?: { baseUrl?: string; timeoutMs?: number });
    getHealth(): Promise<SystemHealthResponse>;
    getMeters(params?: { q?: string; page?: number; pageSize?: number; all?: boolean }): Promise<MeterListResponse>;
    getMeterDetails(meterId: string): Promise<MeterDetail>;
    getMeterConsumption(meterId: string): Promise<ConsumptionHistoryResponse>;
    getTransformers(page?: number): Promise<TransformerListResponse>;
    getHierarchy(): Promise<any[]>;
    exportAll(): Promise<{ total: number; meters: any[] }>;
}

export default FlockEnergyClient;
