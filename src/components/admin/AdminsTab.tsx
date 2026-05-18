import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Trash2, UserPlus, ShieldCheck } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type AdminRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};

export default function AdminsTab() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    setCurrentUserId(userData.user?.id ?? null);
    const { data, error } = await supabase.rpc('list_admins');
    if (error) {
      toast.error('Kunde inte hämta administratörer', { description: error.message });
    } else {
      setAdmins((data ?? []) as AdminRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setAdding(true);
    const { error } = await supabase.rpc('grant_admin_by_email', { _email: trimmed });
    setAdding(false);
    if (error) {
      toast.error('Kunde inte lägga till administratör', { description: error.message });
      return;
    }
    toast.success(`${trimmed} är nu administratör`);
    setEmail('');
    load();
  }

  async function handleRevoke(userId: string, label: string) {
    const { error } = await supabase.rpc('revoke_admin', { _user_id: userId });
    if (error) {
      toast.error('Kunde inte ta bort administratör', { description: error.message });
      return;
    }
    toast.success(`${label} är inte längre administratör`);
    load();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Lägg till administratör</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Användaren måste redan ha ett konto i appen. Ange den e-postadress de registrerade sig med.
        </p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            placeholder="namn@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={adding}
          />
          <Button type="submit" disabled={adding || !email.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lägg till'}
          </Button>
        </form>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-sm">Nuvarande administratörer</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laddar…
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga administratörer hittades.</p>
        ) : (
          <ul className="divide-y">
            {admins.map((a) => {
              const isSelf = a.user_id === currentUserId;
              const label = a.display_name || a.email;
              return (
                <li key={a.user_id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{label}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                  </div>
                  {isSelf ? (
                    <span className="text-xs text-muted-foreground shrink-0">Du</span>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Ta bort admin">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Ta bort administratör?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {label} kommer inte längre kunna nå administrationspanelen.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Avbryt</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRevoke(a.user_id, label)}>
                            Ta bort
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
