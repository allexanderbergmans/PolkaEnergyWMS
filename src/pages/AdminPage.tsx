import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeToggle } from '@/components/theme-toggle';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { TimeEntry, Task, EmployeeWithSettings, Announcement, Shift } from '@/types';
import {
  Zap, Users, Clock, DollarSign, Download, LogOut,
  Plus, X, Check, User, Edit2, Save, Megaphone,
  CalendarDays, Pin, ChevronDown, ChevronUp, FileText, Trash2
} from 'lucide-react';

type AdminTab = 'employees' | 'timerecords' | 'tasks' | 'payroll' | 'announcements' | 'schedule';

interface NewTaskForm {
  title: string;
  description: string;
  assigned_to: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
}

interface NewShiftForm {
  user_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  notes: string;
}

const makeEmployeeEmail = (username: string) => {
  const slug = username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || 'employee'}-${Date.now()}-${suffix}@example.com`;
};

const AdminPage = () => {
  const { user, employeeSettings, loading, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>('employees');
  const [employees, setEmployees] = useState<EmployeeWithSettings[]>([]);
  const [activeUsers, setActiveUsers] = useState<Map<string, string>>(new Map());
  const [timeEntries, setTimeEntries] = useState<(TimeEntry & { username?: string; email?: string })[]>([]);
  const [tasks, setTasks] = useState<(Task & { assigned_to_name?: string })[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [shifts, setShifts] = useState<(Shift & { username?: string })[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingWage, setEditingWage] = useState<string | null>(null);
  const [wageValue, setWageValue] = useState('');
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [newEmpUsername, setNewEmpUsername] = useState('');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpIsAdmin, setNewEmpIsAdmin] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [startDateValue, setStartDateValue] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [newTask, setNewTask] = useState<NewTaskForm>({
    title: '', description: '', assigned_to: '', priority: 'medium', due_date: ''
  });
  const [dateFilter, setDateFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  // Announcements state
  const [showNewAnnouncement, setShowNewAnnouncement] = useState(false);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnBody, setNewAnnBody] = useState('');
  const [newAnnPinned, setNewAnnPinned] = useState(false);
  // Schedule state
  const [showNewShift, setShowNewShift] = useState(false);
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0);
  const [newShift, setNewShift] = useState<NewShiftForm>({
    user_id: '', shift_date: '', start_time: '09:00', end_time: '17:00', notes: ''
  });

  useEffect(() => {
    if (!loading && !user) { navigate('/login'); return; }
    if (!loading && employeeSettings !== null && !employeeSettings.is_admin) navigate('/dashboard');
  }, [user, employeeSettings, loading, navigate]);

  const fetchEmployees = useCallback(async () => {
    setLoadingData(true);
    const { data: profiles } = await supabase.from('user_profiles').select('*');
    const { data: settings } = await supabase.from('employee_settings').select('*');
    const merged: EmployeeWithSettings[] = (profiles || []).map(p => ({
      ...p,
      employee_settings: (settings || []).find(s => s.user_id === p.id) || null,
    }));
    setEmployees(merged);
    const { data: activeEntries } = await supabase
      .from('time_entries').select('user_id, status').in('status', ['active', 'on_break']);
    const statusMap = new Map<string, string>();
    (activeEntries || []).forEach(e => statusMap.set(e.user_id, e.status));
    setActiveUsers(statusMap);
    setLoadingData(false);
  }, []);

  const fetchTimeEntries = useCallback(async () => {
    setLoadingData(true);
    const [year, month] = dateFilter.split('-');
    const start = `${year}-${month}-01T00:00:00`;
    const endDate = new Date(Number(year), Number(month), 0);
    const end = `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59`;
    const { data: entries } = await supabase.from('time_entries').select('*')
      .gte('clock_in', start).lte('clock_in', end).order('clock_in', { ascending: false });
    const { data: profiles } = await supabase.from('user_profiles').select('id, username, email');
    const enriched = (entries || []).map(e => ({
      ...e,
      username: profiles?.find(p => p.id === e.user_id)?.username || 'Unknown',
      email: profiles?.find(p => p.id === e.user_id)?.email || '',
    }));
    setTimeEntries(enriched);
    setLoadingData(false);
  }, [dateFilter]);

  const fetchTasks = useCallback(async () => {
    setLoadingData(true);
    const { data: taskData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    const { data: profiles } = await supabase.from('user_profiles').select('id, username');
    const enriched = (taskData || []).map(t => ({
      ...t,
      assigned_to_name: profiles?.find(p => p.id === t.assigned_to)?.username || 'Unassigned',
    }));
    setTasks(enriched);
    setLoadingData(false);
  }, []);

  const fetchAnnouncements = useCallback(async () => {
    setLoadingData(true);
    const { data } = await supabase.from('announcements').select('*')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false });
    setAnnouncements(data || []);
    setLoadingData(false);
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoadingData(true);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + scheduleWeekOffset * 7 - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const start = weekStart.toISOString().split('T')[0];
    const end = weekEnd.toISOString().split('T')[0];
    const { data } = await supabase.from('shifts').select('*')
      .gte('shift_date', start).lte('shift_date', end).order('shift_date', { ascending: true });
    const { data: profiles } = await supabase.from('user_profiles').select('id, username');
    const enriched = (data || []).map(s => ({
      ...s,
      username: profiles?.find(p => p.id === s.user_id)?.username || 'Unknown',
    }));
    setShifts(enriched);
    setLoadingData(false);
  }, [scheduleWeekOffset]);

  useEffect(() => {
    if (loading || !user) return;
    if (activeTab === 'employees') fetchEmployees();
    else if (activeTab === 'timerecords' || activeTab === 'payroll') fetchTimeEntries();
    else if (activeTab === 'tasks') { fetchTasks(); fetchEmployees(); }
    else if (activeTab === 'announcements') fetchAnnouncements();
    else if (activeTab === 'schedule') { fetchShifts(); fetchEmployees(); }
  }, [activeTab, fetchEmployees, fetchTimeEntries, fetchTasks, fetchAnnouncements, fetchShifts, loading, user]);

  useEffect(() => {
    if (activeTab !== 'employees' || loading || !user) return;
    const interval = setInterval(async () => {
      const { data: activeEntries } = await supabase
        .from('time_entries').select('user_id, status').in('status', ['active', 'on_break']);
      const statusMap = new Map<string, string>();
      (activeEntries || []).forEach(e => statusMap.set(e.user_id, e.status));
      setActiveUsers(statusMap);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loading, user]);

  useEffect(() => {
    if (activeTab === 'timerecords' || activeTab === 'payroll') fetchTimeEntries();
  }, [dateFilter, activeTab, fetchTimeEntries]);

  useEffect(() => {
    if (activeTab === 'schedule') fetchShifts();
  }, [scheduleWeekOffset, activeTab, fetchShifts]);

  const handleSaveWage = async (userId: string) => {
    const wage = parseFloat(wageValue);
    if (isNaN(wage) || wage < 0) { toast.error('Invalid wage'); return; }
    const { error } = await supabase.from('employee_settings').upsert({
      user_id: userId,
      hourly_wage: wage,
      is_admin: employees.find(e => e.id === userId)?.employee_settings?.is_admin || false,
    }, { onConflict: 'user_id' });
    if (error) { toast.error('Failed to update'); return; }
    toast.success('Wage updated');
    setEditingWage(null);
    fetchEmployees();
  };

  const handleSaveProfile = async (emp: EmployeeWithSettings) => {
    const { error } = await supabase.from('employee_settings').upsert({
      user_id: emp.id,
      hourly_wage: emp.employee_settings?.hourly_wage || 0,
      is_admin: emp.employee_settings?.is_admin || false,
      notes: noteValue || null,
      start_date: startDateValue || null,
      contact_phone: phoneValue || null,
    }, { onConflict: 'user_id' });
    if (error) { toast.error('Failed to save profile'); return; }
    toast.success('Profile saved');
    setEditingNote(null);
    fetchEmployees();
  };

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assigned_to) { toast.error('Task title and assignee are required'); return; }
    const { error } = await supabase.from('tasks').insert({
      title: newTask.title, description: newTask.description || null,
      assigned_to: newTask.assigned_to, assigned_by: user?.id || null,
      priority: newTask.priority, due_date: newTask.due_date || null, status: 'pending',
    });
    if (error) { toast.error('Failed to create task'); return; }
    toast.success('Task created');
    setNewTask({ title: '', description: '', assigned_to: '', priority: 'medium', due_date: '' });
    setShowNewTask(false);
    fetchTasks();
  };

  const handleToggleAdmin = async (emp: EmployeeWithSettings) => {
    const isAdmin = !emp.employee_settings?.is_admin;
    await supabase.from('employee_settings').upsert({
      user_id: emp.id,
      hourly_wage: emp.employee_settings?.hourly_wage || 0,
      is_admin: isAdmin,
    }, { onConflict: 'user_id' });
    toast.success('Role updated');
    fetchEmployees();
  };

  const handleCreateEmployee = async () => {
    if (!newEmpUsername || !newEmpPassword) { toast.error('Username and password are required'); return; }
    const generatedEmail = makeEmployeeEmail(newEmpUsername);
    try {
      const { data, error: authError } = await supabase.auth.signUp({ email: generatedEmail, password: newEmpPassword });
      if (authError) throw authError;
      const newUser = data.user;
      if (!newUser) throw new Error('Failed to create auth user');
      const { error: profileError } = await supabase.from('user_profiles').insert({
        id: newUser.id, username: newEmpUsername, email: generatedEmail,
      });
      if (profileError) throw profileError;
      const { error: settingsError } = await supabase.from('employee_settings').upsert({
        user_id: newUser.id, hourly_wage: 0, is_admin: newEmpIsAdmin,
      }, { onConflict: 'user_id' });
      if (settingsError) throw settingsError;
      toast.success('Employee created');
      setNewEmpUsername(''); setNewEmpPassword(''); setNewEmpIsAdmin(false); setShowNewEmployee(false);
      fetchEmployees();
    } catch (e) {
      toast.error('Failed to create employee');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from('tasks').delete().eq('id', taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
    toast.success('Task deleted');
  };

  const handleMarkTaskComplete = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskId);
    fetchTasks();
    toast.success('Marked complete');
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnTitle) { toast.error('Title is required'); return; }
    const { error } = await supabase.from('announcements').insert({
      title: newAnnTitle, body: newAnnBody || null, pinned: newAnnPinned, created_by: user?.id,
    });
    if (error) { toast.error('Failed to post announcement'); return; }
    toast.success('Announcement posted');
    setNewAnnTitle(''); setNewAnnBody(''); setNewAnnPinned(false); setShowNewAnnouncement(false);
    fetchAnnouncements();
  };

  const handleDeleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id);
    setAnnouncements(announcements.filter(a => a.id !== id));
    toast.success('Deleted');
  };

  const handleTogglePin = async (ann: Announcement) => {
    await supabase.from('announcements').update({ pinned: !ann.pinned }).eq('id', ann.id);
    fetchAnnouncements();
  };

  const handleCreateShift = async () => {
    if (!newShift.user_id || !newShift.shift_date) { toast.error('Employee and date are required'); return; }
    const { error } = await supabase.from('shifts').insert({
      user_id: newShift.user_id, shift_date: newShift.shift_date,
      start_time: newShift.start_time, end_time: newShift.end_time,
      notes: newShift.notes || null, created_by: user?.id,
    });
    if (error) { toast.error('Failed to create shift'); return; }
    toast.success('Shift scheduled');
    setNewShift({ user_id: '', shift_date: '', start_time: '09:00', end_time: '17:00', notes: '' });
    setShowNewShift(false);
    fetchShifts();
  };

  const handleDeleteShift = async (id: string) => {
    await supabase.from('shifts').delete().eq('id', id);
    setShifts(shifts.filter(s => s.id !== id));
    toast.success('Shift removed');
  };

  const payrollData = employees.map(emp => {
    const empEntries = timeEntries.filter(e => e.user_id === emp.id && e.status === 'completed');
    const totalMins = empEntries.reduce((a, e) => a + (e.total_minutes || 0), 0);
    const breakMins = empEntries.reduce((a, e) => a + (e.break_minutes || 0), 0);
    const billableMins = totalMins - breakMins;
    const wage = emp.employee_settings?.hourly_wage || 0;
    return { ...emp, totalHours: totalMins / 60, breakHours: breakMins / 60, billableHours: billableMins / 60, grossPay: (billableMins / 60) * wage, shifts: empEntries.length };
  }).filter(e => e.shifts > 0);

  const exportCSV = (type: 'time' | 'payroll') => {
    let csv = '';
    if (type === 'time') {
      csv = 'Employee,Email,Clock In,Clock Out,Total Hours,Break Minutes,Status\n';
      timeEntries.forEach(e => {
        csv += `"${e.username}","${e.email}","${new Date(e.clock_in).toLocaleString()}","${e.clock_out ? new Date(e.clock_out).toLocaleString() : 'Active'}","${((e.total_minutes || 0) / 60).toFixed(2)}","${e.break_minutes}","${e.status}"\n`;
      });
    } else {
      csv = 'Employee,Email,Hourly Wage,Total Hours,Break Hours,Billable Hours,Gross Pay\n';
      payrollData.forEach(e => {
        csv += `"${e.username}","${e.email}","${e.employee_settings?.hourly_wage || 0}","${e.totalHours.toFixed(2)}","${e.breakHours.toFixed(2)}","${e.billableHours.toFixed(2)}","${e.grossPay.toFixed(2)}"\n`;
      });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `polka-energy-${type}-${dateFilter}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Export ready');
  };

  const handleSignOut = async () => {
    await authService.signOut(); logout(); navigate('/login');
  };

  const getWeekLabel = () => {
    const now = new Date();
    now.setDate(now.getDate() + scheduleWeekOffset * 7);
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    if (scheduleWeekOffset === 0) return 'This week';
    if (scheduleWeekOffset === 1) return 'Next week';
    if (scheduleWeekOffset === -1) return 'Last week';
    return `${monday.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  };

  const fmtShiftTime = (t: string) => {
    const [h, m] = t.split(':');
    const d = new Date(); d.setHours(+h, +m);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'employees', label: 'Employees' },
    { id: 'timerecords', label: 'Time Records' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'schedule', label: 'Schedule' },
  ];

  const priorityColor: Record<string, string> = {
    low: 'text-muted-foreground', medium: 'text-blue-600', high: 'text-amber-600', urgent: 'text-red-600',
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground rounded flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-background" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm">Polka Energy</span>
            <span className="text-xs text-muted-foreground ml-1 border border-border rounded px-1.5 py-0.5">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:block">{user?.username}</span>
            </div>
            <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Employees', val: employees.length, icon: Users },
            { label: 'Active tasks', val: tasks.filter(t => t.status !== 'completed').length, icon: null },
            { label: 'Hours this month', val: `${(timeEntries.reduce((a, e) => a + (e.total_minutes || 0), 0) / 60).toFixed(0)}h`, icon: Clock },
            { label: 'Payroll this month', val: `$${payrollData.reduce((a, e) => a + e.grossPay, 0).toFixed(0)}`, icon: DollarSign },
          ].map((s) => (
            <div key={s.label} className="border border-border rounded-lg p-4 bg-card">
              <p className="text-lg font-semibold text-foreground">{s.val}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-border mb-6 gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* EMPLOYEES */}
        {activeTab === 'employees' && (
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Employee Management</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Set wages, admin access and add new employees</p>
              </div>
              <button
                onClick={() => setShowNewEmployee(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
              >
                Add Employee
              </button>
            </div>
            {showNewEmployee && (
              <div className="p-5 border-b border-border">
                <h3 className="text-sm font-medium mb-4">Create New Employee</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Username</label>
                    <input value={newEmpUsername} onChange={(e) => setNewEmpUsername(e.target.value)} placeholder="Username"
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Password</label>
                    <input type="password" value={newEmpPassword} onChange={(e) => setNewEmpPassword(e.target.value)} placeholder="Password"
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" checked={newEmpIsAdmin} onChange={(e) => setNewEmpIsAdmin(e.target.checked)} className="mr-2" />
                    <label className="text-xs text-muted-foreground">Admin</label>
                  </div>
                  <div className="flex justify-end gap-2 col-span-2">
                    <button onClick={() => setShowNewEmployee(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button onClick={handleCreateEmployee} className="px-4 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">Create</button>
                  </div>
                </div>
              </div>
            )}
            {loadingData ? (
              <div className="flex justify-center p-12">
                <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {employees.map((emp) => (
                  <div key={emp.id}>
                    {/* Employee Row */}
                    <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                      {/* Avatar + status */}
                      <div className="relative w-8 h-8 flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium text-muted-foreground">{emp.username?.charAt(0).toUpperCase()}</span>
                        </div>
                        {activeUsers.has(emp.id) && (
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${activeUsers.get(emp.id) === 'on_break' ? 'bg-amber-400' : 'bg-green-500'}`} />
                        )}
                      </div>
                      {/* Name + status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{emp.username}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${emp.employee_settings?.is_admin ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border'}`}>
                            {emp.employee_settings?.is_admin ? 'Admin' : 'Employee'}
                          </span>
                        </div>
                        {activeUsers.has(emp.id) && (
                          <p className={`text-xs mt-0.5 ${activeUsers.get(emp.id) === 'on_break' ? 'text-amber-600' : 'text-green-600'}`}>
                            {activeUsers.get(emp.id) === 'on_break' ? 'On break' : 'Clocked in'}
                          </p>
                        )}
                      </div>
                      {/* Wage */}
                      <div className="hidden sm:flex items-center gap-1.5">
                        {editingWage === emp.id ? (
                          <>
                            <span className="text-muted-foreground text-sm">$</span>
                            <input type="number" value={wageValue} onChange={(e) => setWageValue(e.target.value)}
                              className="w-20 bg-input border border-border rounded px-2 py-1 text-sm focus:outline-none focus:border-foreground" step="0.01" min="0" autoFocus />
                            <button onClick={() => handleSaveWage(emp.id)} className="p-1 text-foreground hover:opacity-70"><Save className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingWage(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-muted-foreground">${(emp.employee_settings?.hourly_wage || 0).toFixed(2)}/hr</span>
                            <button onClick={() => { setEditingWage(emp.id); setWageValue(String(emp.employee_settings?.hourly_wage || 0)); }}
                              className="p-1 text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
                          </>
                        )}
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {emp.id !== user?.id && (
                          <button onClick={() => handleToggleAdmin(emp)} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
                            {emp.employee_settings?.is_admin ? 'Remove admin' : 'Make admin'}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (expandedEmployee === emp.id) { setExpandedEmployee(null); setEditingNote(null); }
                            else {
                              setExpandedEmployee(emp.id);
                              setNoteValue(emp.employee_settings?.notes || '');
                              setStartDateValue(emp.employee_settings?.start_date || '');
                              setPhoneValue(emp.employee_settings?.contact_phone || '');
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="View profile"
                        >
                          {expandedEmployee === emp.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {/* Expanded Profile Panel */}
                    {expandedEmployee === emp.id && (
                      <div className="px-5 py-4 bg-muted/20 border-t border-border">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Profile Details</span>
                          </div>
                          {editingNote !== emp.id ? (
                            <button onClick={() => setEditingNote(emp.id)} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                              <Edit2 className="w-3 h-3" /> Edit
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditingNote(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                              <button onClick={() => handleSaveProfile(emp)} className="text-xs bg-foreground text-background px-2.5 py-1 rounded hover:opacity-90 transition-opacity">Save</button>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Start date</p>
                            {editingNote === emp.id ? (
                              <input type="date" value={startDateValue} onChange={(e) => setStartDateValue(e.target.value)}
                                className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-foreground" />
                            ) : (
                              <p className="text-sm">{emp.employee_settings?.start_date ? new Date(emp.employee_settings.start_date + 'T00:00:00').toLocaleDateString() : '—'}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Phone</p>
                            {editingNote === emp.id ? (
                              <input type="tel" value={phoneValue} onChange={(e) => setPhoneValue(e.target.value)} placeholder="+1 555 000 0000"
                                className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-foreground" />
                            ) : (
                              <p className="text-sm">{emp.employee_settings?.contact_phone || '—'}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Email</p>
                            <p className="text-sm text-muted-foreground truncate">{emp.email}</p>
                          </div>
                          <div className="sm:col-span-3">
                            <p className="text-xs text-muted-foreground mb-1">Internal notes</p>
                            {editingNote === emp.id ? (
                              <textarea value={noteValue} onChange={(e) => setNoteValue(e.target.value)} rows={3} placeholder="Performance notes, certifications, equipment assigned..."
                                className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-foreground resize-none" />
                            ) : (
                              <p className="text-sm text-muted-foreground">{emp.employee_settings?.notes || 'No notes'}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIME RECORDS */}
        {activeTab === 'timerecords' && (
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm">Time Records</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{timeEntries.length} entries</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-input border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-foreground" />
                <button onClick={() => exportCSV('time')} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-muted transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
            {loadingData ? (
              <div className="flex justify-center p-12"><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['Employee', 'Clock In', 'Clock Out', 'Total', 'Break', 'Billable', 'Status'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {timeEntries.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted-foreground text-sm py-12">No records</td></tr>
                    ) : timeEntries.map((entry) => {
                      const billable = (entry.total_minutes || 0) - (entry.break_minutes || 0);
                      return (
                        <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium">{entry.username}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(entry.clock_in).toLocaleString()}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{entry.clock_out ? new Date(entry.clock_out).toLocaleString() : '—'}</td>
                          <td className="px-5 py-3 text-sm">{((entry.total_minutes || 0) / 60).toFixed(2)}h</td>
                          <td className="px-5 py-3 text-sm text-muted-foreground">{entry.break_minutes}m</td>
                          <td className="px-5 py-3 text-sm font-medium">{(billable / 60).toFixed(2)}h</td>
                          <td className="px-5 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${entry.status === 'completed' ? 'bg-muted text-muted-foreground' : entry.status === 'on_break' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TASKS */}
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Task Management</h2>
              <button onClick={() => setShowNewTask(!showNewTask)} className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">
                {showNewTask ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showNewTask ? 'Cancel' : 'New task'}
              </button>
            </div>
            {showNewTask && (
              <div className="border border-border rounded-lg bg-card p-5">
                <h3 className="text-sm font-medium mb-4">Assign task</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Title *</label>
                    <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title"
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Assign to *</label>
                    <select value={newTask.assigned_to} onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground">
                      <option value="">Select employee...</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.username}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Priority</label>
                    <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as NewTaskForm['priority'] })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground">
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Due date</label>
                    <input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Description</label>
                    <textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="Optional details..." rows={2}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground resize-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowNewTask(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  <button onClick={handleCreateTask} className="px-4 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">Create</button>
                </div>
              </div>
            )}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['Task', 'Assigned to', 'Priority', 'Due', 'Status', ''].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingData ? (
                      <tr><td colSpan={6} className="text-center py-12"><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                    ) : tasks.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-muted-foreground text-sm py-12">No tasks yet</td></tr>
                    ) : tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium">{task.title}</p>
                          {task.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>}
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{task.assigned_to_name}</td>
                        <td className="px-5 py-3"><span className={`text-xs font-medium ${priorityColor[task.priority]}`}>{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span></td>
                        <td className="px-5 py-3 text-xs text-muted-foreground">{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-muted text-muted-foreground' : task.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-muted/50 text-muted-foreground border border-border'}`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1">
                            {task.status !== 'completed' && (
                              <button onClick={() => handleMarkTaskComplete(task.id)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Complete"><Check className="w-3.5 h-3.5" /></button>
                            )}
                            <button onClick={() => handleDeleteTask(task.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Delete"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PAYROLL */}
        {activeTab === 'payroll' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm">Payroll Report</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Based on clocked billable hours</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="month" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-input border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-foreground" />
                <button onClick={() => exportCSV('payroll')} className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-sm rounded-md hover:bg-muted transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Total payroll', val: `$${payrollData.reduce((a, e) => a + e.grossPay, 0).toFixed(2)}` },
                { label: 'Billable hours', val: `${payrollData.reduce((a, e) => a + e.billableHours, 0).toFixed(1)}h` },
                { label: 'Employees worked', val: payrollData.length.toString() },
              ].map(s => (
                <div key={s.label} className="border border-border rounded-lg bg-card p-4">
                  <p className="text-xl font-semibold">{s.val}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {['Employee', 'Rate/hr', 'Total', 'Break', 'Billable', 'Gross pay'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loadingData ? (
                      <tr><td colSpan={6} className="text-center py-12"><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                    ) : payrollData.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-muted-foreground text-sm py-12">No data for this period</td></tr>
                    ) : payrollData.map((emp) => (
                      <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-muted-foreground">{emp.username?.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">{emp.username}</p>
                              <p className="text-xs text-muted-foreground">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">${(emp.employee_settings?.hourly_wage || 0).toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-sm">{emp.totalHours.toFixed(2)}h</td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{emp.breakHours.toFixed(2)}h</td>
                        <td className="px-5 py-3.5 text-sm">{emp.billableHours.toFixed(2)}h</td>
                        <td className="px-5 py-3.5 text-base font-semibold">${emp.grossPay.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">Announcements</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Visible to all employees on their dashboard</p>
              </div>
              <button onClick={() => setShowNewAnnouncement(!showNewAnnouncement)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">
                {showNewAnnouncement ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showNewAnnouncement ? 'Cancel' : 'New'}
              </button>
            </div>
            {showNewAnnouncement && (
              <div className="border border-border rounded-lg bg-card p-5">
                <h3 className="text-sm font-medium mb-4">Post announcement</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Title *</label>
                    <input value={newAnnTitle} onChange={(e) => setNewAnnTitle(e.target.value)} placeholder="Announcement title"
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Body</label>
                    <textarea value={newAnnBody} onChange={(e) => setNewAnnBody(e.target.value)} placeholder="Additional details..." rows={3}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground resize-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="pinned" checked={newAnnPinned} onChange={(e) => setNewAnnPinned(e.target.checked)} className="rounded" />
                    <label htmlFor="pinned" className="text-xs text-muted-foreground">Pin to top</label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowNewAnnouncement(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button onClick={handleCreateAnnouncement} className="px-4 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">Post</button>
                  </div>
                </div>
              </div>
            )}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              {loadingData ? (
                <div className="flex justify-center p-12"><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>
              ) : announcements.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-16">
                  <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p>No announcements yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="flex items-start gap-4 px-5 py-4">
                      <div className={`mt-0.5 flex-shrink-0 ${ann.pinned ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {ann.pinned ? <Pin className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{ann.title}</p>
                          {ann.pinned && <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">Pinned</span>}
                        </div>
                        {ann.body && <p className="text-sm text-muted-foreground mt-1">{ann.body}</p>}
                        <p className="text-xs text-muted-foreground mt-2">{new Date(ann.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleTogglePin(ann)} title={ann.pinned ? 'Unpin' : 'Pin'}
                          className={`p-1.5 rounded transition-colors ${ann.pinned ? 'text-foreground hover:opacity-70' : 'text-muted-foreground hover:text-foreground'}`}>
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteAnnouncement(ann.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm">Shift Scheduling</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Assign weekly shifts to employees</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
                  <button onClick={() => setScheduleWeekOffset(w => w - 1)} className="px-2.5 py-1.5 text-sm hover:bg-muted transition-colors">‹</button>
                  <span className="px-3 py-1.5 text-sm font-medium border-x border-border">{getWeekLabel()}</span>
                  <button onClick={() => setScheduleWeekOffset(w => w + 1)} className="px-2.5 py-1.5 text-sm hover:bg-muted transition-colors">›</button>
                </div>
                <button onClick={() => setShowNewShift(!showNewShift)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">
                  {showNewShift ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {showNewShift ? 'Cancel' : 'Add shift'}
                </button>
              </div>
            </div>
            {showNewShift && (
              <div className="border border-border rounded-lg bg-card p-5">
                <h3 className="text-sm font-medium mb-4">Schedule shift</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Employee *</label>
                    <select value={newShift.user_id} onChange={(e) => setNewShift({ ...newShift, user_id: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground">
                      <option value="">Select employee...</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.username}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Date *</label>
                    <input type="date" value={newShift.shift_date} onChange={(e) => setNewShift({ ...newShift, shift_date: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Start time</label>
                    <input type="time" value={newShift.start_time} onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">End time</label>
                    <input type="time" value={newShift.end_time} onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                    <input value={newShift.notes} onChange={(e) => setNewShift({ ...newShift, notes: e.target.value })} placeholder="e.g. Site B, bring equipment"
                      className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setShowNewShift(false)} className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  <button onClick={handleCreateShift} className="px-4 py-1.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity">Schedule</button>
                </div>
              </div>
            )}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              {loadingData ? (
                <div className="flex justify-center p-12"><div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div>
              ) : shifts.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-16">
                  <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  <p>No shifts scheduled for {getWeekLabel().toLowerCase()}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Employee', 'Date', 'Time', 'Duration', 'Notes', ''].map(h => (
                          <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {shifts.map((shift) => {
                        const [sh, sm] = shift.start_time.split(':').map(Number);
                        const [eh, em] = shift.end_time.split(':').map(Number);
                        const durationMins = (eh * 60 + em) - (sh * 60 + sm);
                        const today = new Date().toISOString().split('T')[0];
                        const isToday = shift.shift_date === today;
                        return (
                          <tr key={shift.id} className={`hover:bg-muted/30 transition-colors ${isToday ? 'bg-muted/10' : ''}`}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs font-medium text-muted-foreground">{(shift.username || 'U').charAt(0).toUpperCase()}</span>
                                </div>
                                <span className="text-sm font-medium">{shift.username}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <p className="text-sm">{new Date(shift.shift_date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                              {isToday && <p className="text-xs text-green-600 mt-0.5">Today</p>}
                            </td>
                            <td className="px-5 py-3.5 text-sm font-mono text-muted-foreground">
                              {fmtShiftTime(shift.start_time)} – {fmtShiftTime(shift.end_time)}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-muted-foreground">
                              {Math.floor(durationMins / 60)}h{durationMins % 60 > 0 ? ` ${durationMins % 60}m` : ''}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-muted-foreground">{shift.notes || '—'}</td>
                            <td className="px-5 py-3.5">
                              <button onClick={() => handleDeleteShift(shift.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
