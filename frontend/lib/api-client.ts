import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

declare module 'axios' {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  // NOTE: Next.js can import modules during SSR; guard localStorage usage.
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config ?? {};
    const status = error.response?.status;

    if (status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
      originalRequest._retry = true;
      try {
        const refreshResponse = await apiClient.post('/auth/refresh', {});
        const newToken = refreshResponse.data?.access_token;
        if (newToken) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('token', newToken);
          }
          originalRequest.headers = {
            ...(originalRequest.headers || {}),
            Authorization: `Bearer ${newToken}`,
          };
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Do NOT redirect here. Let pages explicitly guard routes.
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
        }
        return Promise.reject(refreshError);
      }
    }

    if (status === 401) {
      // Do NOT redirect here. Let pages explicitly guard routes.
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

