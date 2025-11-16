import apiClient from './api-client';
import type { User, Submission, Payment, Usage, DashboardStats, ContactMessage } from '@/types';

// Auth API
export const authAPI = {
  register: async (email: string, password: string, name: string) => {
    const response = await apiClient.post('/auth/register', { email, password, name });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },

  socialLogin: async (provider: 'google' | 'facebook', token: string) => {
    const response = await apiClient.post('/auth/social', { provider, token });
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me');
    return response.data.user;
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout', {});
    } catch (err) {
      // Ignore logout network errors to allow client-side cleanup
    } finally {
      localStorage.removeItem('token');
    }
  },

  refresh: async () => {
    const response = await apiClient.post('/auth/refresh', {});
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    return response.data;
  },

  serverLogout: async () => {
    await authAPI.logout();
  },
};

// Submission API
export const submissionAPI = {
  submitText: async (payload: { text: string; html?: string }): Promise<Submission> => {
    const response = await apiClient.post('/submit', payload);
    if (response.data?.submission) {
      return response.data.submission as Submission;
    }
    return response.data as Submission;
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

  archiveSubmission: async (id: number): Promise<{ status: string; archived_at: string; retention_in: number }> => {
    const response = await apiClient.delete(`/submissions/${id}`);
    return response.data;
  },

  getArchivedSubmissions: async (): Promise<{ submissions: Submission[]; retention_days: number; message: string }> => {
    const response = await apiClient.get('/archive');
    return response.data;
  },
};

// Contact API
export const contactAPI = {
  sendMessage: async (payload: { name: string; email: string; message: string }): Promise<{ status: string }> => {
    const response = await apiClient.post('/contact', payload);
    return response.data;
  },

  getMessages: async (): Promise<{ messages: ContactMessage[] }> => {
    const response = await apiClient.get('/admin/contact');
    return response.data;
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

