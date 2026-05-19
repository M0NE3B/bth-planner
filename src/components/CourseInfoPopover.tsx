/**
 * Click-to-open course info popover. Shows code, name, HP, subject,
 * status (if the student has the course in their plan), the courses it
 * unlocks within the student's program, and the cleaned original
 * prerequisite text from the catalog.
 */
import { useMemo, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Lock, Unlock, GraduationCap } from 'lucide-react';
import { COURSE_STATUS_LABEL } from '@/lib/events';

export interface CourseInfoData {
  code: string;
  name?: string | null;
  hp?: number | null;
  subject?: string | null;
  level?: string | null;
  status?: string | null;
  originalRequirementText?: string | null;
  /** Courses the student has in their plan that this course unlocks. */
  unlocksInPlan?: string[];
  /** Lookup helper for prerequisite-target names. */
  nameOf?: (code: string) => string | undefined;
}

interface Props {
  info: CourseInfoData;
  children?: ReactNode;
}

export default function CourseInfoPopover({ info, children }: Props) {
  const trigger = useMemo(() => {
    if (children) return children;
    const label = info.name ? `${info.name} (${info.code})` : info.code;
    return (
      <button
        type="button"
        className="font-mono text-left hover:underline hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        {label}
      </button>
    );
  }, [children, info]);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 text-sm space-y-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-foreground">{info.code}</span>
            {info.hp != null && <Badge variant="outline" className="text-xs">{info.hp} HP</Badge>}
            {info.level && <Badge variant="secondary" className="text-xs">{info.level}</Badge>}
            {info.status && (
              <Badge variant="outline" className="text-xs">
                {COURSE_STATUS_LABEL[info.status] || info.status}
              </Badge>
            )}
          </div>
          {info.name && <p className="text-foreground font-medium leading-snug mt-1">{info.name}</p>}
          {info.subject && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <BookOpen className="h-3 w-3" /> {info.subject}
            </p>
          )}
        </div>

        {info.originalRequirementText && (
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
              <Lock className="h-3 w-3" /> Förkunskapskrav
            </p>
            <p className="text-xs text-muted-foreground leading-snug">{info.originalRequirementText}</p>
          </div>
        )}

        {info.unlocksInPlan && info.unlocksInPlan.length > 0 && (
          <div className="pt-2 border-t border-border/60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
              <Unlock className="h-3 w-3" /> Låser upp i din plan
            </p>
            <ul className="text-xs text-foreground space-y-0.5">
              {info.unlocksInPlan.map((code) => {
                const name = info.nameOf?.(code);
                return (
                  <li key={code} className="font-mono">
                    {code}{name ? <span className="font-sans text-muted-foreground"> – {name}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!info.originalRequirementText && (!info.unlocksInPlan || info.unlocksInPlan.length === 0) && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <GraduationCap className="h-3 w-3" /> Inga extra förkunskaper inom programmet.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
