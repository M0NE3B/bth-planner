import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, CheckCircle2, Circle, PlayCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatHp } from '@/lib/utils';

type Status = 'not_started' | 'partly' | 'completed';

interface CourseRow {
  id: string;
  course_code: string;
  course_name: string;
  hp: number;
  year: number;
  status: Status;
}

interface Props {
  userId: string;
  onComplete: () => void;
}

const STATUS_OPTIONS: { value: Status; label: string; icon: typeof Circle; cls: string }[] = [
  { value: 'not_started', label: 'Ej påbörjad', icon: Circle, cls: 'text-muted-foreground' },
  { value: 'partly', label: 'Påbörjad', icon: PlayCircle, cls: 'text-amber-600 dark:text-amber-400' },
  { value: 'completed', label: 'Avklarad', icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
];

export default function CourseStatusOnboardingPage({ userId, onComplete }: Props) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('user_courses')
        .select('id, course_code, course_name, hp, year, status')
        .eq('user_id', userId)
        .order('year', { ascending: true })
        .order('course_code', { ascending: true });
      setCourses((data || []).map(r => ({
        ...r,
        hp: Number(r.hp || 0),
        status: (r.status as Status) || 'not_started',
      })));
      setLoading(false);
    })();
  }, [userId]);

  const byYear = useMemo(() => {
    const m = new Map<number, CourseRow[]>();
    for (const c of courses) {
      const arr = m.get(c.year) ?? [];
      arr.push(c);
      m.set(c.year, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [courses]);

  const setStatus = (id: string, status: Status) => {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  };

  const setAllInYear = (year: number, status: Status) => {
    setCourses(prev => prev.map(c => c.year === year ? { ...c, status } : c));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = courses.map(c =>
        supabase.from('user_courses')
          .update({ status: c.status })
          .eq('id', c.id)
          .eq('user_id', userId)
      );
      const results = await Promise.all(updates);
      const err = results.find(r => r.error)?.error;
      if (err) throw err;

      const { error: profErr } = await supabase
        .from('profiles')
        .update({ status_onboarding_complete: true })
        .eq('user_id', userId);
      if (profErr) throw profErr;

      toast.success('Kursstatusar sparade!');
      onComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kunde inte spara';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="container py-6 flex items-center gap-2">
        <GraduationCap className="h-7 w-7 text-primary" />
        <span className="font-heading font-bold text-xl text-foreground">BTH Studieplanerare</span>
      </header>

      <main className="container max-w-3xl py-4 pb-32 animate-slide-up">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
          Kom igång: markera din kursstatus
        </h2>
        <p className="text-muted-foreground mb-4">
          Översikt, riskbild och “Fokusera härnäst” fungerar bäst när vi vet vilka kurser
          du redan klarat av. Markera en status för varje kurs — du kan ändra detta senare när som helst.
        </p>

        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Alla kurser börjar som <span className="font-medium text-foreground">Ej påbörjad</span>.
              Du behöver bara markera de som är påbörjade eller avklarade.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laddar kurser...</p>
        ) : courses.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            Inga kurser hittades på din studieplan.
          </CardContent></Card>
        ) : (
          <div className="space-y-5">
            {byYear.map(([year, list]) => (
              <section key={year}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-heading text-base font-semibold">År {year}</h3>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="text-xs h-7"
                      onClick={() => setAllInYear(year, 'not_started')}>
                      Nollställ år
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs h-7"
                      onClick={() => setAllInYear(year, 'completed')}>
                      Allt avklarat
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {list.map(c => (
                    <Card key={c.id}>
                      <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{c.course_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.course_code} · {formatHp(c.hp)} HP
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {STATUS_OPTIONS.map(opt => {
                            const Icon = opt.icon;
                            const active = c.status === opt.value;
                            return (
                              <Button
                                key={opt.value}
                                type="button"
                                size="sm"
                                variant={active ? 'default' : 'outline'}
                                onClick={() => setStatus(c.id, opt.value)}
                                className="gap-1.5 text-xs h-8"
                              >
                                <Icon className={`h-3.5 w-3.5 ${active ? '' : opt.cls}`} />
                                {opt.label}
                              </Button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-30">
        <div className="container max-w-3xl py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground hidden sm:block">
            Du kan ändra kursstatusar när som helst senare.
          </p>
          <Button
            size="lg"
            onClick={handleSave}
            disabled={loading || saving || courses.length === 0}
            className="w-full sm:w-auto"
          >
            {saving ? 'Sparar...' : 'Spara och gå till översikt'}
          </Button>
        </div>
      </div>
    </div>
  );
}
