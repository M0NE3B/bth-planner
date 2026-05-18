import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Loader2 } from 'lucide-react';

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const { isAdmin, loading } = useIsAdmin(userId ?? null);

  if (userId === undefined || (userId && loading)) {
    return (
      <div className="min-h-[40vh] grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center space-y-3 px-4">
        <h1 className="font-heading text-xl font-semibold">Åtkomst nekad</h1>
        <p className="text-sm text-muted-foreground">
          Du har inte behörighet att se administrationspanelen.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
