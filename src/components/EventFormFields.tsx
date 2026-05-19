import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { EVENT_TYPE_OPTIONS, EVENT_STATUS_OPTIONS } from '@/lib/events';
import CourseCodeCombobox from '@/components/CourseCodeCombobox';

export interface EventFormFieldsCourse {
  course_code: string;
  course_name: string;
}

export interface EventFormFieldsProps {
  idPrefix: string;
  courses: EventFormFieldsCourse[];
  fTitle: string;
  setFTitle: (v: string) => void;
  fCourse: string;
  setFCourse: (v: string) => void;
  fType: string;
  setFType: (v: string) => void;
  fDate: string;
  setFDate: (v: string) => void;
  fTime: string;
  setFTime: (v: string) => void;
  fHp: string;
  setFHp: (v: string) => void;
  fDesc: string;
  setFDesc: (v: string) => void;
  fStatus?: string;
  setFStatus?: (v: string) => void;
  hpHelp?: string;
}

/**
 * Shared form fields for editing/creating a study event.
 * Used by Dashboard.tsx and CalendarPage.tsx edit dialogs.
 */
export default function EventFormFields({
  idPrefix, courses,
  fTitle, setFTitle,
  fCourse, setFCourse,
  fType, setFType,
  fDate, setFDate,
  fTime, setFTime,
  fHp, setFHp,
  fDesc, setFDesc,
  fStatus, setFStatus,
  hpHelp = 'Används för att prioritera större moment högre.',
}: EventFormFieldsProps) {
  const showStatus = fStatus !== undefined && setFStatus !== undefined;
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-title`}>Titel *</Label>
        <Input id={`${idPrefix}-title`} value={fTitle} onChange={e => setFTitle(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-course`}>Kurs</Label>
        <Select value={fCourse} onValueChange={setFCourse}>
          <SelectTrigger><SelectValue placeholder="Välj kurs" /></SelectTrigger>
          <SelectContent>
            {courses.map(c => (
              <SelectItem key={c.course_code} value={c.course_code}>
                {c.course_code} - {c.course_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={showStatus ? 'grid grid-cols-2 gap-3' : ''}>
        <div>
          <Label htmlFor={`${idPrefix}-type`}>Typ</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showStatus && (
          <div>
            <Label htmlFor={`${idPrefix}-status`}>Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}-date`}>Datum *</Label>
          <DateInput id={`${idPrefix}-date`} value={fDate} onChange={setFDate} required />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-time`}>Tid</Label>
          <TimeInput id={`${idPrefix}-time`} value={fTime} onChange={setFTime} />
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-hp`}>Omfattning / HP</Label>
        <Input
          id={`${idPrefix}-hp`}
          type="text"
          inputMode="decimal"
          value={fHp}
          onChange={e => setFHp(e.target.value.replace(',', '.'))}
          placeholder="t.ex. 1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">{hpHelp}</p>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-desc`}>Beskrivning</Label>
        <Textarea id={`${idPrefix}-desc`} value={fDesc} onChange={e => setFDesc(e.target.value)} rows={3} />
      </div>
    </>
  );
}
