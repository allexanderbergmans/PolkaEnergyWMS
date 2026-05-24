import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { user, employeeSettings, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login');
    } else if (employeeSettings?.is_admin) {
      navigate('/admin');
    } else {
      navigate('/dashboard');
    }
  }, [user, employeeSettings, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-mono text-sm">Initializing...</p>
      </div>
    </div>
  );
};

export default Index;
