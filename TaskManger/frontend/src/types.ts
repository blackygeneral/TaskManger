export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  timezone: string;
  language: "en" | "ar";
  theme: "light" | "dark" | "system";
  email_verified: boolean;
  email_notifications: boolean;
  phone: string;
  phone_verified: boolean;
  sms_consent: boolean;
  sms_provider: string;
};
export type Category = {
  id: number;
  name: string;
  color: string;
  icon: string;
};
export type Rule = {
  channel: "in_app" | "email" | "sms";
  minutes?: number;
  at?: string;
};
export type Task = {
  id: number;
  title: string;
  description: string;
  notes: string;
  category: number | null;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  start: string | null;
  end: string | null;
  due: string | null;
  all_day: boolean;
  date: string | null;
  end_date: string | null;
  timezone: string;
  subtasks: { title: string; done: boolean }[];
  recurrence: { frequency?: string; count?: number; days?: number[] };
  series: string;
  occurrence: number;
  reminder_rules: Rule[];
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type Notice = {
  id: number;
  title: string;
  task: number | null;
  read: boolean;
  created_at: string;
};
