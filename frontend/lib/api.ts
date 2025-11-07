import apiClient from './api-client';
import type { User, Submission, Payment, Usage, DashboardStats } from '@/types';

// Auth API
export const authAPI = {
  register: async (email: string, password: string, name: string) => {
    const response = await apiClient.post('/auth/register', { email, password, name });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    return response.data.user;
  },

  logout: () => {
    localStorage.removeItem('token');
  },
};

// Submission API
export const submissionAPI = {
  submitText: async (text: string): Promise<Submission> => {
    const response = await apiClient.post('/submit', { text });
    return response.data;
  },

  getSubmissions: async (limit = 10, offset = 0): Promise<{ submissions: Submission[] }> => {
    const response = await apiClient.get('/submissions', {
      params: { limit, offset },
    });
    return response.data;
  },

  getSubmission: async (id: number): Promise<Submission> => {
    const response = await apiClient.get(`/submissions/${id}`);
    return response.data.submission;
  },
};

// Payment API
export const paymentAPI = {
  createPayment: async (data: {
    amount: number;
    currency: string;
    payment_method: string;
    payment_type: string;
    description?: string;
    submission_id?: number;
  }) => {
    const response = await apiClient.post('/payments/create', data);
    return response.data;
  },

  verifyPayment: async (transactionId: string, paymentId: string) => {
    const response = await apiClient.post('/payments/verify', {
      transaction_id: transactionId,
      payment_id: paymentId,
    });
    return response.data;
  },

  getPayments: async (limit = 10, offset = 0): Promise<{ payments: Payment[]; total: number }> => {
    const response = await apiClient.get('/payments', {
      params: { limit, offset },
    });
    return response.data;
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/dashboard/stats');
    return response.data;
  },

  getUsage: async (): Promise<{ usage: Usage[] }> => {
    const response = await apiClient.get('/usage');
    return response.data;
  },
};

// Admin API
export const adminAPI = {
  getUsers: async (limit = 20, offset = 0) => {
    const response = await apiClient.get('/admin/users', {
      params: { limit, offset },
    });
    return response.data;
  },

  updateUser: async (id: number, data: Partial<User>) => {
    const response = await apiClient.put(`/admin/users/${id}`, data);
    return response.data;
  },

  deleteUser: async (id: number) => {
    const response = await apiClient.delete(`/admin/users/${id}`);
    return response.data;
  },

  getPayments: async (limit = 20, offset = 0) => {
    const response = await apiClient.get('/admin/payments', {
      params: { limit, offset },
    });
    return response.data;
  },

  getAnalytics: async () => {
    const response = await apiClient.get('/admin/analytics');
    return response.data;
  },

  getModelLogs: async (limit = 50, offset = 0) => {
    const response = await apiClient.get('/admin/model-logs', {
      params: { limit, offset },
    });
    return response.data;
  },
};

