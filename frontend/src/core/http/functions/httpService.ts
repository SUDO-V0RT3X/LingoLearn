import axios from 'axios';
import type { AxiosResponse } from 'axios';

export enum RequestMethod {
    GET, POST, PUT, PATCH, DELETE
}
const prod = import.meta.env.PROD;
// Local backend port, overridable so a second dev backend can run alongside the default
const devApiPort = import.meta.env.VITE_API_PORT ?? '4000';

// ============================================================================
// IAM owns token creation; this shared transport attaches the saved session to
// every protected request and leaves public/custom-base-URL requests untouched.
// ============================================================================
function getAuthHeaders(): Record<string, string> {
    const storage = typeof window !== 'undefined' && 'localStorage' in window ? window.localStorage : null;
    const token = storage?.getItem('lingolearn_auth_token');
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
}

export class HttpService {
    static readonly baseUrl: string = prod ? '' : `http://${window.location.hostname}:${devApiPort}`;

    static async makeRequest(
        method: RequestMethod,
        endPoint: string,
        data?: any,
        queryParameters?: any,
        customHeaders?: Record<string, string>,
        customBaseUrl?: string,
        // 'blob' for a file the API streams back (e.g. a saved recording); JSON otherwise.
        responseType?: 'json' | 'blob',
    ): Promise<AxiosResponse> {
        try {
            // Handle query params
            if (queryParameters) {
                endPoint += `?${new URLSearchParams(queryParameters).toString()}`;
            }

            const url = (customBaseUrl ?? this.baseUrl) + endPoint;

            // Auth headers for backend API requests (not public routes or custom base URLs)
            const authHeaders: Record<string, string> =
                (!customBaseUrl && !endPoint.startsWith('/api/public/')) ? getAuthHeaders() : {};

            const config = {
                headers: {
                    ...authHeaders,
                    ...(customHeaders || {}),
                },
                ...(responseType ? { responseType } : {}),
            };

            switch (method) {
                case RequestMethod.GET:
                    return axios.get(url, config);
                case RequestMethod.POST:
                    return axios.post(url, data, config);
                case RequestMethod.PUT:
                    return axios.put(url, data, config);
                case RequestMethod.PATCH:
                    return axios.patch(url, data, config);
                case RequestMethod.DELETE:
                    return axios.delete(url, config);
            }
        } catch (e) {
            // Never log `data`: it can hold a password or a link code.
            console.warn(`Request could not be sent: ${RequestMethod[method]} ${endPoint}`);
            throw e;
        }
    }
}
