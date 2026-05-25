import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeToggle } from '@/components/theme-toggle';
import { supabase } from '@/lib/supabase';
import { TimeEntry, Task, EmployeeWithSettings } from '@/types';
import {
  TrendingUp, Clock, DollarSign, Target, Calendar, Users,
  BarChart3, PieChart, Download, Filter, ChevronDown
} from 'lucide-react';

interface AnalyticsData {
  totalHours: number;
  totalPay: number;
  averageHoursPerDay: number;
  productivityScore: number;
  taskCompletionRate: number;
  overtimeHours: number;
  topPerformers: EmployeeWithSettings[];
  weeklyTrend: { date: string; hours: number; pay: number }[];
  departmentStats: { department: string; hours: number; employees: number }[];
}

const AnalyticsPage = () => {
  const { user, employeeSettings, loading, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dateRange, setDateRange] = useState('30days');
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    
    setLoadingData(true);
    try {
      // Get date range
      const days = parseInt(dateRange.replace('days', ''));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Fetch time entries for the user
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('*')
        .gte('clock_in', startDate.toISOString())
        .order('clock_in', { ascending: false });

      // Fetch tasks for the user
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', user.id)
        .gte('created_at', startDate.toISOString());

      // Fetch all employees for department stats
      const { data: profiles } = await supabase.from('user_profiles').select('*');
      const { data: settings } = await supabase.from('employee_settings').select('*');
      
      const employees: EmployeeWithSettings[] = (profiles || []).map(p => ({
        ...p,
        employee_settings: (settings || []).find(s => s.user_id === p.id) || null,
      }));

      // Calculate analytics
      const totalHours = (timeEntries || []).reduce((sum, entry) => 
        sum + (entry.total_minutes || 0) / 60, 0
      );
      
      const totalPay = (timeEntries || []).reduce((sum, entry) => {
        const wage = employees.find(e => e.id === entry.user_id)?.employee_settings?.hourly_wage || 0;
        const billableMinutes = (entry.total_minutes || 0) - (entry.break_minutes || 0);
        return sum + (billableMinutes / 60) * wage;
      }, 0);

      const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0;
      const totalTasks = tasks?.length || 0;
      const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      const standardHours = Math.min(days * 8, totalHours);
      const overtimeHours = Math.max(0, totalHours - standardHours);
      
      const averageHoursPerDay = totalHours / days;

      // Calculate productivity score (0-100)
      const productivityScore = Math.min(100, 
        (averageHoursPerDay / 8) * 50 + // Hours-based (50% weight)
        (taskCompletionRate / 100) * 50 // Task completion (50% weight)
      );

      // Get weekly trend
      const weeklyTrend = [];
      for (let i = 0; i < Math.min(4, Math.ceil(days / 7)); i++) {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const weekEntries = timeEntries?.filter(entry => {
          const entryDate = new Date(entry.clock_in);
          return entryDate >= weekStart && entryDate <= weekEnd;
        }) || [];

        const weekHours = weekEntries.reduce((sum, entry) => 
          sum + (entry.total_minutes || 0) / 60, 0
        );
        
        const weekPay = weekEntries.reduce((sum, entry) => {
          const wage = employees.find(e => e.id === entry.user_id)?.employee_settings?.hourly_wage || 0;
          const billableMinutes = (entry.total_minutes || 0) - (entry.break_minutes || 0);
          return sum + (billableMinutes / 60) * wage;
        }, 0);

        weeklyTrend.push({
          date: weekStart.toLocaleDateString(),
          hours: weekHours,
          pay: weekPay
        });
      }

      // Department stats (simplified - using username as department for demo)
      const departmentStats = employees.reduce((acc, emp) => {
        const dept = emp.employee_settings?.department || 'General';
        const existing = acc.find(d => d.department === dept);
        if (existing) {
          existing.hours += (timeEntries?.filter(e => e.user_id === emp.id).reduce((sum, e) => 
            sum + (e.total_minutes || 0) / 60, 0) || 0);
          existing.employees += 1;
        } else {
          acc.push({
            department: dept,
            hours: (timeEntries?.filter(e => e.user_id === emp.id).reduce((sum, e) => 
              sum + (e.total_minutes || 0) / 60, 0) || 0),
            employees: 1
          });
        }
        return acc;
      }, [] as { department: string; hours: number; employees: number }[]);

      // Top performers (by hours worked)
      const topPerformers = employees
        .map(emp => ({
          ...emp,
          hours: (timeEntries?.filter(e => e.user_id === emp.id).reduce((sum, e) => 
            sum + (e.total_minutes || 0) / 60, 0) || 0)
        }))
        .filter(emp => emp.hours > 0)
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 5);

      setAnalyticsData({
        totalHours,
        totalPay,
        averageHoursPerDay,
        productivityScore,
        taskCompletionRate,
        overtimeHours,
        topPerformers,
        weeklyTrend,
        departmentStats
      });

    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoadingData(false);
    }
  }, [user, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const exportAnalytics = () => {
    if (!analyticsData) return;
    
    let csv = 'Metric,Value\n';
    csv += `Total Hours,${analyticsData.totalHours.toFixed(2)}\n`;
    csv += `Total Pay,$${analyticsData.totalPay.toFixed(2)}\n`;
    csv += `Average Hours/Day,${analyticsData.averageHoursPerDay.toFixed(2)}\n`;
    csv += `Productivity Score,${analyticsData.productivityScore.toFixed(1)}%\n`;
    csv += `Task Completion Rate,${analyticsData.taskCompletionRate.toFixed(1)}%\n`;
    csv += `Overtime Hours,${analyticsData.overtimeHours.toFixed(2)}\n`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polka-energy-analytics-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Analytics exported');
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
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground rounded flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-background" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-sm">Polka Energy</span>
            <span className="text-xs text-muted-foreground ml-1 border border-border rounded px-1.5 py-0.5">Analytics</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{user?.username}</span>
            </div>
            <button onClick={() => { authService.signOut(); logout(); navigate('/login'); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-8">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">Track your performance and productivity metrics</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-foreground"
            >
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
              <option value="90days">Last 90 days</option>
            </select>
            <button
              onClick={exportAnalytics}
              className="flex items-center gap-2 px-4 py-2 border border-border text-sm rounded-md hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Hours', value: `${analyticsData?.totalHours.toFixed(1)}h`, icon: Clock, color: 'text-blue-600' },
            { label: 'Total Pay', value: `$${analyticsData?.totalPay.toFixed(2)}`, icon: DollarSign, color: 'text-green-600' },
            { label: 'Productivity', value: `${analyticsData?.productivityScore.toFixed(1)}%`, icon: Target, color: 'text-purple-600' },
            { label: 'Task Rate', value: `${analyticsData?.taskCompletionRate.toFixed(1)}%`, icon: BarChart3, color: 'text-orange-600' },
          ].map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="border border-border rounded-lg p-6 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${metric.color}`} />
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{metric.value}</p>
              </div>
            );
          })}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Weekly Trend */}
          <div className="border border-border rounded-lg bg-card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Weekly Trend
            </h3>
            <div className="space-y-3">
              {analyticsData?.weeklyTrend.map((week, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{week.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">{week.hours.toFixed(1)}h</span>
                    <span className="text-sm text-green-600">${week.pay.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Department Stats */}
          <div className="border border-border rounded-lg bg-card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" />
              Department Performance
            </h3>
            <div className="space-y-3">
              {analyticsData?.departmentStats.map((dept, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{dept.department}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">{dept.hours.toFixed(1)}h</span>
                    <span className="text-xs text-muted-foreground">{dept.employees} emp</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Performers */}
        <div className="border border-border rounded-lg bg-card">
          <div className="p-6 border-b border-border">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              Top Performers
            </h3>
          </div>
          <div className="p-6">
            {analyticsData?.topPerformers.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No performance data available</p>
            ) : (
              <div className="space-y-4">
                {analyticsData?.topPerformers.map((performer, index) => (
                  <div key={performer.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-gray-100 text-gray-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' : 'bg-muted'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{performer.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {performer.employee_settings?.department || 'General'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{performer.hours.toFixed(1)}h</p>
                      <p className="text-xs text-muted-foreground">
                        ${(performer.hours * (performer.employee_settings?.hourly_wage || 0)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;