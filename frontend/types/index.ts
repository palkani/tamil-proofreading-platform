export type UserRole = 'writer' | 'reviewer' | 'admin';
export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'enterprise';
export type SubmissionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ModelType = 'model_a' | 'model_b';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'stripe' | 'razorpay';
export type PaymentType = 'pay_per_use' | 'subscription';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  subscription: SubscriptionPlan;
  subscription_end?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Submission {
  id: number;
  user_id: number;
  name?: string;
  original_text: string;
  original_html?: string;
  proofread_text?: string;
  word_count: number;
  model_used: ModelType;
  status: SubmissionStatus;
  suggestions?: string;
  alternatives?: string;
  include_alternatives?: boolean;
  error?: string;
  processing_time?: number;
  cost: number;
  archived?: boolean;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: number;
  user_id: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_type: PaymentType;
  transaction_id: string;
  gateway_payment_id?: string;
  invoice_number?: string;
  invoice_url?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Usage {
  id: number;
  user_id: number;
  word_count: number;
  model_used: ModelType;
  submission_id?: number;
  date: string;
  created_at: string;
  updated_at: string;
}

export interface Suggestion {
  original: string;
  corrected: string;
  reason: string;
  type: string;
  start_index: number;
  end_index: number;
}

export interface DashboardStats {
  total_submissions: number;
  monthly_word_usage: number;
  model_usage: {
    model_a: number;
    model_b: number;
  };
  submissions_status: {
    pending: number;
    completed: number;
  };
  recent_submissions: Submission[];
  subscription: {
    plan: SubscriptionPlan;
    subscription_end?: string;
  };
}

export interface ContactMessage {
  id: number;
  user_id: number;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

