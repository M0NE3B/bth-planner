import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LogOut, User, GraduationCap, Settings as SettingsIcon, RotateCcw, Trash2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { bthPrograms } from '@/lib/programs';
import { estimateStudyYear } from '@/lib/studyYear';
import { toast } from 'sonner';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Link } from 'react-router-dom';

interface SettingsPageProps {
  userId: string;
  email?: string | null;
  programName: string;
  startYear: number;
  onLogout: () => void;
  onResetPlan?: () => void;
}

interface CourseRow {
  course_code: string;
  hp: number;
  status: 'completed' | 'partly' | 'not_started';
}

export default function SettingsPage({ userId, email, programName, startYear, onLogout, onResetPlan }: SettingsPageProps) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.from('user_courses')
      .select('course_code, hp, status')
      .eq('user_id', userId)
      .then(({ data }) => {
        setCourses((data || []) as CourseRow[]);
        setLoading(false);
      });
  }, [userId]);

  const programTemplate = useMemo(
    () => bthPrograms.find(p => p.name === programName) || null,
    [programName],
  );

  const estimate = useMemo(
    () => (startYear ? estimateStudyYear(startYear) : null),
    [startYear],
  );

  const completedHp = courses.filter(c => c.status === 'completed').reduce((s, c) => s + Number(c.hp || 0), 0);
  const totalProgramHp = programTemplate ? programTemplate.courses.reduce((s, c) => s + c.hp, 0)
    : courses.reduce((s, c) => s + Number(c.hp || 0), 0);
  const progressPct = totalProgramHp > 0 ? Math.round((completedHp / totalProgramHp) * 100) : 0;

  const handleResetPlan = async () => {
    setResetting(true);
    // Clear study-plan related data
    const ops = await Promise.all([
      supabase.from('course_subtasks').delete().eq('user_id', userId),
      supabase.from('study_events').delete().eq('user_id', userId),
      supabase.from('user_courses').delete().eq('user_id', userId),
      supabase.from('profiles').update({ setup_complete: false, program_name: null, start_year: null }).eq('user_id', userId),
    ]);
    setResetting(false);
    const err = ops.find(o => o.error)?.error;
    if (err) {
      toast.error('Kunde inte återställa studieplanen');
      return;
    }
    toast.success('Studieplanen är återställd');
    setResetOpen(false);
    onResetPlan?.();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== 'RADERA') {
      toast.error('Skriv RADERA för att bekräfta');
      return;
    }
    setDeleting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { error } = await supabase.functions.invoke('delete-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      toast.success('Kontot är raderat');
      await supabase.auth.signOut();
      setDeleteOpen(false);
    } catch (e) {
      toast.error('Kunde inte radera kontot');
    } finally {
      setDeleting(false);
    }
  };

  const { isAdmin } = useIsAdmin(userId);

  const settingsContent = (
    <>
      {/* Account */}
      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <User className="h-4 w-4" /> Konto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">E-post</span>
            <span className="text-sm text-foreground font-medium text-right truncate">
              {email || 'Okänd'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="secondary">Inloggad</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Study plan */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> Studieplan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm text-muted-foreground shrink-0">Program</span>
            <span className="text-sm text-foreground font-medium text-right">{programName || 'Inget valt'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Startår</span>
            <span className="text-sm text-foreground">{startYear || '–'}</span>
          </div>
          {estimate && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-muted-foreground shrink-0">Just nu</span>
              <span className="text-sm text-foreground text-right font-medium">
                {estimate.uncertain ? estimate.label : (
                  <>År {estimate.year}, termin {estimate.semester} ({estimate.semester === 1 ? 'HT' : 'VT'})</>
                )}
              </span>
            </div>
          )}
          {programTemplate && !loading && (
            <>
              <div className="pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Kurser</p>
                  <p className="text-sm font-semibold">{courses.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">HP klara</p>
                  <p className="text-sm font-semibold">{completedHp}/{totalProgramHp}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Framsteg</p>
                  <p className="text-sm font-semibold">{progressPct}%</p>
                </div>
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            Detaljerade rekommendationer och risker visas på översikten.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> Åtgärder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" onClick={() => setResetOpen(true)} className="w-full gap-2 justify-start">
            <RotateCcw className="h-4 w-4" /> Börja om studieplan
          </Button>
          <Button variant="outline" onClick={onLogout} className="w-full gap-2 justify-start">
            <LogOut className="h-4 w-4" /> Logga ut
          </Button>
          <Button
            variant="outline"
            onClick={() => { setDeleteConfirm(''); setDeleteOpen(true); }}
            className="w-full gap-2 justify-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Radera konto
          </Button>
        </CardContent>
      </Card>

      {/* Reset confirmation */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Börja om studieplanen?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar bort dina kurser, delmoment och kalenderhändelser och tar dig tillbaka till val av program och startår.
              Ditt konto och din inloggning behålls. Åtgärden kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleResetPlan(); }}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? 'Återställer...' : 'Börja om'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete account confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Radera konto permanent?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta tar bort ditt konto, din studieplan, dina kurser, delmoment och kalenderhändelser. Åtgärden kan inte ångras.
              <br /><br />
              Skriv <span className="font-mono font-semibold text-foreground">RADERA</span> för att bekräfta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="del-confirm" className="sr-only">Bekräftelse</Label>
            <Input
              id="del-confirm"
              autoComplete="off"
              placeholder="RADERA"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
              disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'RADERA'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Raderar...' : 'Radera konto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return (
    <div className="max-w-2xl mx-auto md:mt-12 animate-slide-up space-y-4 px-1">
      <h1 className="font-heading text-2xl font-bold text-foreground">Inställningar</h1>
      {isAdmin && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Administration</div>
                <div className="text-xs text-muted-foreground truncate">
                  Hantera kurskatalog, program och administratörer
                </div>
              </div>
            </div>
            <Button asChild size="sm">
              <Link to="/admin">Öppna</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {settingsContent}
    </div>
  );
}

