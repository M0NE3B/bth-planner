import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Sparkles, ListChecks, CalendarPlus, AlertTriangle, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  userId: string;
  onDismissed: () => void;
  onFocusRisk?: () => void;
  onFocusNext?: () => void;
}

export default function OnboardingChecklist({ userId, onDismissed, onFocusRisk, onFocusNext }: Props) {
  const [hiding, setHiding] = useState(false);

  const dismiss = async () => {
    setHiding(true);
    await supabase
      .from('profiles')
      .update({ onboarding_checklist_dismissed: true })
      .eq('user_id', userId);
    onDismissed();
  };

  const items = [
    {
      icon: ListChecks,
      title: 'Lägg till delmoment',
      desc: 'Bryt ner pågående kurser i mindre delmoment för bättre planering.',
      action: <Button asChild size="sm" variant="outline"><Link to="/kurser">Till kurser</Link></Button>,
    },
    {
      icon: CalendarPlus,
      title: 'Lägg till viktiga datum',
      desc: 'Mata in deadlines, tentor och inlämningar.',
      action: <Button asChild size="sm" variant="outline"><Link to="/add-event">Lägg till händelse</Link></Button>,
    },
    {
      icon: AlertTriangle,
      title: 'Kontrollera riskbild',
      desc: 'Se vilka kurser och deadlines som behöver din uppmärksamhet.',
      action: <Button size="sm" variant="outline" onClick={onFocusRisk}>Visa riskbild</Button>,
    },
    {
      icon: Target,
      title: 'Kolla Fokusera härnäst',
      desc: 'Få förslag på vad du bör jobba med nu.',
      action: <Button size="sm" variant="outline" onClick={onFocusNext}>Visa fokus</Button>,
    },
  ];

  if (hiding) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 mb-4 animate-slide-up">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-heading font-semibold text-foreground">Kom igång</h3>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 -mt-1 -mr-1" onClick={dismiss} aria-label="Stäng checklista">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Några snabba steg för att få ut det mesta av planeraren.
        </p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={i} className="flex items-start gap-3 p-3 rounded-md bg-background/60 border border-border/50">
                <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{it.title}</p>
                  <p className="text-xs text-muted-foreground mb-2">{it.desc}</p>
                  {it.action}
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
