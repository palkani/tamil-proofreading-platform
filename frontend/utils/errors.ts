import axios from 'axios';

interface ApiErrorPayload {
  error?: string;
  message?: string;
  detail?: string;
  details?: string;
}

export const extractApiErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiErrorPayload | undefined;
    return data?.error ?? data?.message ?? data?.detail ?? data?.details ?? error.message ?? fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
};

