import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Trash2, RefreshCw, Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface FeedbackRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function FeedbackTab() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const [toDelete, setToDelete] = useState<FeedbackRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'archived'>('new');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_feedback');
    if (error) {
      toast.error('Kunde inte hämta feedback');
      setLoading(false);
      return;
    }
    setItems((data || []) as FeedbackRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: 'new' | 'archived') => {
    const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
    if (error) {
      toast.error('Kunde inte uppdatera status');
      return;
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    if (selected?.id === id) setSelected({ ...selected, status });
    toast.success(status === 'archived' ? 'Arkiverad' : 'Återställd');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from('feedback').delete().eq('id', toDelete.id);
    if (error) {
      toast.error('Kunde inte radera');
      return;
    }
    setItems(prev => prev.filter(i => i.id !== toDelete.id));
    if (selected?.id === toDelete.id) setSelected(null);
    setToDelete(null);
    toast.success('Raderad');
  };

  const filtered = items.filter(i => filter === 'all' ? true : i.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm font-semibold">Inkommen feedback</h3>
          <Badge variant="secondary">{items.filter(i => i.status === 'new').length} nya</Badge>
        </div>
        <div className="flex gap-1">
          {(['new', 'archived', 'all'] as const).map(f => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {f === 'new' ? 'Nya' : f === 'archived' ? 'Arkiverade' : 'Alla'}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Uppdatera
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ingen feedback att visa.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <Card key={item.id} className={item.status === 'archived' ? 'opacity-70' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="font-heading text-sm flex items-center gap-2 flex-wrap">
                      <span className="truncate">{item.subject}</span>
                      {item.status === 'archived' && (
                        <Badge variant="outline" className="text-xs">Arkiverad</Badge>
                      )}
                      {item.status === 'new' && (
                        <Badge className="text-xs">Ny</Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.display_name || item.email || 'Okänd användare'}
                      {item.email && item.display_name ? ` · ${item.email}` : ''}
                      {' · '}
                      {format(new Date(item.created_at), 'd MMM yyyy HH:mm', { locale: sv })}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm whitespace-pre-wrap line-clamp-3">{item.message}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                    Öppna
                  </Button>
                  {item.status === 'new' ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(item.id, 'archived')} className="gap-1">
                      <Archive className="h-3.5 w-3.5" /> Arkivera
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(item.id, 'new')} className="gap-1">
                      <ArchiveRestore className="h-3.5 w-3.5" /> Återställ
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setToDelete(item)}
                    className="gap-1 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Radera
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="break-words">{selected?.subject}</DialogTitle>
            <DialogDescription>
              {selected?.display_name || selected?.email || 'Okänd användare'}
              {selected?.email && selected?.display_name ? ` · ${selected.email}` : ''}
              {selected && ` · ${format(new Date(selected.created_at), 'd MMM yyyy HH:mm', { locale: sv })}`}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
            {selected?.message}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Radera feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar bort meddelandet permanent. Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Radera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
