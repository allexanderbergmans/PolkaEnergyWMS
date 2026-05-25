import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeToggle } from '@/components/theme-toggle';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { TimeEntry, BreakEntry, Task } from '@/types';
import {
  Zap, Clock, Coffee, LogOut, CheckSquare, Square,
  Play, StopCircle, ChevronDown, ChevronUp, User, BarChart3
} from 'lucide-react';

const DashboardPage = () => {
  const { user, employeeSettings, loading, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [activeBreak, setActiveBreak] = useState<BreakEntry | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const [loadingAction, setLoadingAction] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  const fetchActiveEntry = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'on_break'])
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveEntry(data || null);
    if (data?.status === 'on_break') {
      const { data: breakData } = await supabase
        .from('break_entries')
        .select('*')
        .eq('time_entry_id', data.id)
        .is('break_end', null)
        .maybeSingle();
      setActiveBreak(breakData || null);
    } else {
      setActiveBreak(null);
    }
  }, [user]);

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', user.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false });
    setTasks(data || []);
  }, [user]);

  const fetchTodayEntries = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in', today + 'T00:00:00')
      .order('clock_in', { ascending: false });
    setTodayEntries(data || []);
  }, [user]);

  useEffect(() => {
    fetchActiveEntry();
    fetchTasks();
    fetchTodayEntries();
  }, [fetchActiveEntry, fetchTasks, fetchTodayEntries]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      if (activeEntry?.status === 'active') {
        setElapsed(Math.floor((Date.now() - new Date(activeEntry.clock_in).getTime()) / 1000));
      }
      if (activeBreak) {
        setBreakElapsed(Math.floor((Date.now() - new Date(activeBreak.break_start).getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeEntry, activeBreak]);

  useEffect(() => {
    if (activeEntry) setElapsed(Math.floor((Date.now() - new Date(activeEntry.clock_in).getTime()) / 1000));
    if (activeBreak) setBreakElapsed(Math.floor((Date.now() - new Date(activeBreak.break_start).getTime()) / 1000));
  }, [activeEntry, activeBreak]);

  const fmt = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleClockIn = async () => {
    if (!user) return;
    setLoadingAction(true);
    const { data, error } = await supabase.from('time_entries').insert({
      user_id: user.id, clock_in: new Date().toISOString(), status: 'active',
    }).select().single();
    if (error) toast.error('Failed to clock in');
    else { setActiveEntry(data); setElapsed(0); toast.success('Clocked in'); fetchTodayEntries(); }
    setLoadingAction(false);
  };

  const handleStartBreak = async () => {
    if (!activeEntry) return;
    setLoadingAction(true);
    await supabase.from('time_entries').update({ status: 'on_break' }).eq('id', activeEntry.id);
    const { data } = await supabase.from('break_entries').insert({
      time_entry_id: activeEntry.id, break_start: new Date().toISOString(),
    }).select().single();
    setActiveEntry({ ...activeEntry, status: 'on_break' });
    setActiveBreak(data);
    setBreakElapsed(0);
    toast.success('Break started');
    setLoadingAction(false);
  };

  const handleEndBreak = async () => {
    if (!activeEntry || !activeBreak) return;
    setLoadingAction(true);
    const breakMins = Math.floor((Date.now() - new Date(activeBreak.break_start).getTime()) / 60000);
    await supabase.from('break_entries').update({ break_end: new Date().toISOString() }).eq('id', activeBreak.id);
    await supabase.from('time_entries').update({
      status: 'active',
      break_minutes: (activeEntry.break_minutes || 0) + breakMins,
    }).eq('id', activeEntry.id);
    setActiveEntry({ ...activeEntry, status: 'active', break_minutes: (activeEntry.break_minutes || 0) + breakMins });
    setActiveBreak(null);
    toast.success('Break ended');
    setLoadingAction(false);
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    setLoadingAction(true);
    if (activeBreak) await handleEndBreak();
    const totalMins = Math.floor((Date.now() - new Date(activeEntry.clock_in).getTime()) / 60000);
    await supabase.from('time_entries').update({
      clock_out: new Date().toISOString(), total_minutes: totalMins, status: 'completed',
    }).eq('id', activeEntry.id);
    setActiveEntry(null);
    setActiveBreak(null);
    setElapsed(0);
    toast.success('Clocked out');
    fetchTodayEntries();
    setLoadingAction(false);
  };

  const handleCompleteTask = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', taskId);
    setTasks(tasks.filter(t => t.id !== taskId));
    toast.success('Task completed');
  };

  const handleSignOut = async () => {
    await authService.signOut();
    logout();
    navigate('/login');
  };

  const todayTotalMins = todayEntries.reduce((a, e) => a + (e.total_minutes || 0), 0);
  const todayBreakMins = todayEntries.reduce((a, e) => a + (e.break_minutes || 0), 0);
  const billableMins = todayTotalMins - todayBreakMins;
  const estimatedPay = (billableMins / 60) * (employeeSettings?.hourly_wage || 0);

  const priorityColor: Record<string, string> = {
    low: 'text-muted-foreground',
    medium: 'text-blue-600',
    high: 'text-amber-600',
    urgent: 'text-red-600',
  };

  const status = activeEntry?.status;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground rounded flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-background" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm">Polka Energy</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-3 py-1.5 text-sm font-medium text-foreground"
            >
              Dashboard
              {/* for deployment */}
            </button>
            <button
              onClick={() => navigate('/analytics')}
              className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Analytics
            </button>
            {(user as any)?.is_admin && (
              <button
                onClick={() => navigate('/admin')}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Admin
              </button>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-xs font-mono hidden sm:block">
              {currentTime.toLocaleTimeString()}
            </span>
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

      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Clock Widget */}
          <div className="lg:col-span-2 space-y-4">
            <div className="border border-border rounded-lg p-7 bg-card">
              {/* Status */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    status === 'active' ? 'status-dot-active animate-pulse' :
                    status === 'on_break' ? 'status-dot-break animate-pulse' :
                    'status-dot-off'
                  }`} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {status === 'active' ? 'Active' : status === 'on_break' ? 'On Break' : 'Off Shift'}
                  </span>
                </div>
                {activeEntry && (
                  <span className="text-xs text-muted-foreground">
                    Since {new Date(activeEntry.clock_in).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Timer */}
              <div className="text-center mb-8">
                <div className="text-6xl font-mono font-light text-foreground tracking-tight">
                  {fmt(status === 'active' ? elapsed : status === 'on_break' ? elapsed : 0)}
                </div>
                {status === 'on_break' && (
                  <p className="text-sm text-muted-foreground mt-2">Break: {fmt(breakElapsed)}</p>
                )}
              </div>

              {/* Buttons */}
              <div className="flex flex-wrap gap-2 justify-center">
                {!activeEntry && (
                  <button
                    onClick={handleClockIn}
                    disabled={loadingAction}
                    className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    <Play className="w-4 h-4" />
                    Clock In
                  </button>
                )}
                {status === 'active' && (
                  <>
                    <button
                      onClick={handleStartBreak}
                      disabled={loadingAction}
                      className="flex items-center gap-2 px-5 py-2.5 border border-border text-sm font-medium rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <Coffee className="w-4 h-4" />
                      Break
                    </button>
                    <button
                      onClick={handleClockOut}
                      disabled={loadingAction}
                      className="flex items-center gap-2 px-5 py-2.5 border border-border text-destructive text-sm font-medium rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <StopCircle className="w-4 h-4" />
                      Clock Out
                    </button>
                  </>
                )}
                {status === 'on_break' && (
                  <>
                    <button
                      onClick={handleEndBreak}
                      disabled={loadingAction}
                      className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      End Break
                    </button>
                    <button
                      onClick={handleClockOut}
                      disabled={loadingAction}
                      className="flex items-center gap-2 px-5 py-2.5 border border-border text-destructive text-sm font-medium rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
                    >
                      <StopCircle className="w-4 h-4" />
                      Clock Out
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Shifts today', val: todayEntries.length.toString() },
                { label: 'Hours worked', val: `${(todayTotalMins / 60).toFixed(1)}h` },
                { label: 'Break time', val: `${todayBreakMins}m` },
                { label: "Today's pay", val: `$${estimatedPay.toFixed(2)}` },
              ].map((s) => (
                <div key={s.label} className="border border-border rounded-lg p-4 bg-card">
                  <p className="text-lg font-semibold text-foreground">{s.val}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* History */}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <span>Shift history</span>
                {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showHistory && (
                <div className="border-t border-border divide-y divide-border">
                  {todayEntries.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-6">No shifts today</p>
                  ) : todayEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm font-mono text-muted-foreground">
                        {new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {entry.clock_out
                          ? new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Active'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {entry.total_minutes ? `${(entry.total_minutes / 60).toFixed(1)}h` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Tasks */}
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Tasks</span>
                </div>
                {tasks.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {tasks.length}
                  </span>
                )}
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {tasks.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No pending tasks</p>
                  </div>
                ) : tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs font-medium ${priorityColor[task.priority]}`}>
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground">
                            · {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pay Rate */}
            <div className="border border-border rounded-lg bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Pay rate</span>
              </div>
              <p className="text-2xl font-semibold text-foreground">
                ${(employeeSettings?.hourly_wage || 0).toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground">/hr</span>
              </p>
              {!employeeSettings?.hourly_wage && (
                <p className="text-xs text-muted-foreground mt-1.5">Not set — contact admin</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
