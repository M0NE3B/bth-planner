import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { EVENT_TYPE_OPTIONS, parseHpInput } from '@/lib/events';

interface AddEventPageProps {
  userId: string;
}

interface UserCourse {
  id: string;
  course_code: string;
  course_name: string;
}

export default function AddEventPage({ userId }: AddEventPageProps) {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<UserCourse[]>([]);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [type, setType] = useState('assignment');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('23:59');
  const [description, setDescription] = useState('');
  const [hp, setHp] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('user_courses').select('id, course_code, course_name, status').eq('user_id', userId)
      .in('status', ['partly', 'not_started'])
      .then(({ data }) => setCourses((data || []) as UserCourse[]));
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      toast.error('Fyll i alla obligatoriska fält');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (dueDate < today) {
      toast.warning('Varning: Datumet har redan passerat');
    }
    const hpParsed = parseHpInput(hp);
    if (hpParsed.ok === false) {
      toast.error(hpParsed.error);
      return;
    }
    const hpFinal = hpParsed.value;
    setLoading(true);
    const { data: eventRow, error } = await supabase.from('study_events').insert({
      user_id: userId,
      title: title.trim(),
      course_code: courseCode || null,
      event_type: type,
      due_date: dueDate,
      due_time: dueTime || null,
      description: description.trim() || null,
      status: 'upcoming',
      hp: hpFinal,
    }).select('id').single();

    if (error || !eventRow) {
      toast.error('Kunde inte spara händelsen');
      setLoading(false);
      return;
    }

    // If event has HP > 0 and is linked to a course, also create a course subtask (delmoment)
    let subtaskCreated = false;
    if (hpFinal > 0 && courseCode) {
      const course = courses.find(c => c.course_code === courseCode);
      if (course) {
        const { error: subErr } = await supabase.from('course_subtasks').insert({
          user_id: userId,
          course_id: course.id,
          title: title.trim(),
          due_date: dueDate,
          hp: hpFinal,
          event_id: eventRow.id,
          type,
          completed: false,
        });
        if (!subErr) subtaskCreated = true;
      }
    }

    toast.success(subtaskCreated ? 'Händelse och delmoment sparade!' : 'Händelse sparad!');
    navigate('/');
    setLoading(false);
  };

  return (
    <div className="max-w-lg mx-auto md:mt-12 animate-slide-up">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 gap-2">
        <ArrowLeft className="h-4 w-4" /> Tillbaka
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Lägg till händelse</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Titel *</Label>
              <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="t.ex. Inlämning 1" required />
            </div>

            <div>
              <Label htmlFor="course">Kurs</Label>
              <Select value={courseCode} onValueChange={setCourseCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj kurs" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map(c => (
                    <SelectItem key={c.id} value={c.course_code}>
                      {c.course_code} - {c.course_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="type">Typ</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="dueDate">Datum *</Label>
                <DateInput id="dueDate" value={dueDate} onChange={setDueDate} required />
              </div>
              <div>
                <Label htmlFor="dueTime">Tid</Label>
                <TimeInput id="dueTime" value={dueTime} onChange={setDueTime} />
              </div>
            </div>

            <div>
              <Label htmlFor="hp">Omfattning / HP</Label>
              <Input
                id="hp"
                type="number"
                step="0.5"
                min="0"
                inputMode="decimal"
                value={hp}
                onChange={e => setHp(e.target.value)}
                placeholder="t.ex. 1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Används för att prioritera större moment högre. Om kurs är vald och HP &gt; 0 läggs händelsen även till som ett delmoment på kursen.
              </p>
            </div>

            <div>
              <Label htmlFor="desc">Beskrivning</Label>
              <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Valfria anteckningar..." rows={3} />
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => navigate(-1)} className="flex-1">
                Avbryt
              </Button>
              <Button type="submit" className="flex-1 gap-2" disabled={loading}>
                <Save className="h-4 w-4" /> {loading ? 'Sparar...' : 'Spara'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
