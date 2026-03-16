export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const SYNC_INTERVAL_MS = Number(process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS) || 30_000;

export const AUTH_TOKEN_KEY = 'float0_access_token';
