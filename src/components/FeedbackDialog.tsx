import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FeedbackDialogProps {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FeedbackDialog({ userId, open, onOpenChange }: FeedbackDialogProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => { setSubject(''); setMessage(''); };

  const handleSubmit = async () => {
    const s = subject.trim();
    const m = message.trim();
    if (!s || s.length > 200) {
      toast.error('Ange ett ämne (max 200 tecken)');
      return;
    }
    if (!m || m.length > 5000) {
      toast.error('Ange ett meddelande (max 5000 tecken)');
      return;
    }
    setSending(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: userId,
      subject: s,
      message: m,
    });
    setSending(false);
    if (error) {
      toast.error('Kunde inte skicka feedback');
      return;
    }
    toast.success('Tack för din feedback!');
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skicka feedback</DialogTitle>
          <DialogDescription>
            Berätta vad du tycker, vad som kan förbättras eller om du hittat en bugg.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-subject">Ämne</Label>
            <Input
              id="fb-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Kort sammanfattning"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-message">Meddelande</Label>
            <Textarea
              id="fb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={6}
              placeholder="Beskriv din feedback..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? 'Skickar...' : 'Skicka'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
