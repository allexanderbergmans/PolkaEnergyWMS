import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Zap } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="w-10 h-10 bg-foreground rounded-lg flex items-center justify-center mx-auto mb-6">
          <Zap className="w-5 h-5 text-background" strokeWidth={2.5} />
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">404</p>
        <h1 className="text-3xl font-semibold text-foreground mb-3">Page not found</h1>
        <p className="text-muted-foreground text-sm mb-8">This page doesn't exist.</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-medium rounded-md hover:opacity-90 transition-opacity"
        >
          Go home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
