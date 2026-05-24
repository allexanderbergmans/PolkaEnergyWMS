export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

export interface EmployeeSettings {
  id: string;
  user_id: string;
  hourly_wage: number;
  is_admin: boolean;
  department?: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
}

export interface EmployeeWithSettings extends UserProfile {
  employee_settings?: EmployeeSettings | null;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out?: string;
  total_minutes?: number;
  break_minutes: number;
  status: 'active' | 'on_break' | 'completed';
  notes?: string;
  created_at: string;
}

export interface BreakEntry {
  id: string;
  time_entry_id: string;
  break_start: string;
  break_end?: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  assigned_by?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  completed_at?: string;
  time_entry_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskWithNames extends Task {
  assigned_to_name?: string;
  assigned_by_name?: string;
}

export interface PaycheckRecord {
  user_id: string;
  username: string;
  email: string;
  hourly_wage: number;
  total_hours: number;
  total_break_hours: number;
  billable_hours: number;
  gross_pay: number;
  period_start: string;
  period_end: string;
}
