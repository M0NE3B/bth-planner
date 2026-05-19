import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileJson, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  parseCatalogJson, planJsonImport, executeJsonImport, fetchDbSnapshot,
  type ImportPlan, type ImportResult, type ParsedCatalog,
} from '@/lib/admin/jsonImport';

export default function JsonImportCard() {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedCatalog | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleFile = async (file: File) => {
    const t = await file.text();
    setText(t);
    setPlan(null);
    setResult(null);
  };

  const handleValidate = async () => {
    setValidating(true);
    setPlan(null);
    setResult(null);
    setParseErrors([]);
    try {
      const { data, errors } = parseCatalogJson(text);
      setParseErrors(errors);
      if (!data) { setParsed(null); return; }
      setParsed(data);
      const snap = await fetchDbSnapshot();
      const p = planJsonImport(data, snap);
      setPlan(p);
    } catch (e) {
      toast.error(`Validering misslyckades: ${e instanceof Error ? e.message : 'okänt fel'}`);
    } finally {
      setValidating(false);
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setConfirmOpen(false);
    setRunning(true);
    try {
      const r = await executeJsonImport(parsed);
      setResult(r);
      toast.success('JSON-import klar');
    } catch (e) {
      toast.error(`Import misslyckades: ${e instanceof Error ? e.message : 'okänt fel'}`);
    } finally {
      setRunning(false);
    }
  };

  const hasBlockingErrors = parseErrors.length > 0 || (plan?.errors.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileJson className="h-4 w-4" /> Importera från JSON
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ladda upp eller klistra in ett förberett JSON-katalogpaket. Förhandsgranska före import.
          Operationen är idempotent och tar aldrig bort befintliga rader.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer border border-border rounded-md px-3 py-2 hover:bg-muted/50">
            <Upload className="h-4 w-4" />
            Välj fil…
            <input
              type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
          </label>
          <Button variant="outline" onClick={handleValidate} disabled={!text.trim() || validating}>
            {validating ? 'Validerar…' : 'Validera & förhandsgranska'}
          </Button>
        </div>

        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPlan(null); setResult(null); }}
          placeholder='{"programs": [...], "courses": [...], "program_courses": [...], "course_prerequisites": [...]}'
          className="min-h-[160px] font-mono text-xs"
        />

        {parseErrors.length > 0 && (
          <ErrorList title="JSON-fel" items={parseErrors} />
        )}

        {plan && (
          <div className="space-y-3">
            <PlanSummary plan={plan} />
            {plan.program_courses.repeated.length > 0 && (
              <WarningList
                title={`Valbara kurser i flera platser (${plan.program_courses.repeated.length}) — importeras som separata rader`}
                items={plan.program_courses.repeated.slice(0, 30).map(
                  (pc) => `${pc.course_code} → ${pc.program_name} (år ${pc.year}, ${pc.semester ?? '-'}, period ${pc.period ?? '-'}, ${pc.mandatory ? 'oblig.' : 'valbar'})`,
                )}
              />
            )}
            {plan.program_courses.duplicates.length > 0 && (
              <WarningList
                title={`Exakta dubbletter i program-kurs-länkar (${plan.program_courses.duplicates.length}) — hoppas över`}
                items={plan.program_courses.duplicates.slice(0, 30).map(
                  (pc) => `${pc.course_code} → ${pc.program_name} (år ${pc.year}, ${pc.semester ?? '-'}, period ${pc.period ?? '-'}, ${pc.mandatory ? 'oblig.' : 'valbar'})`,
                )}
              />
            )}
            {plan.warnings.length > 0 && <WarningList title="Varningar" items={plan.warnings} />}
            {plan.prerequisites.manual.length > 0 && (
              <WarningList
                title={`Manuell granskning (custom_text, ${plan.prerequisites.manual.length})`}
                items={plan.prerequisites.manual.slice(0, 20).map(
                  (p) => `${p.target_course_code}: ${p.original_text ?? '(tom)'}`
                )}
              />
            )}
            <div className="flex gap-2">
              <Button
                disabled={hasBlockingErrors || running}
                onClick={() => setConfirmOpen(true)}
              >
                {running ? 'Importerar…' : 'Importera nu'}
              </Button>
            </div>
          </div>
        )}

        {result && <ResultSummary result={result} />}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importera JSON-katalog?</AlertDialogTitle>
            <AlertDialogDescription>
              Programs, kurser och förkunskaper kommer att upsertas i databasen.
              Inga rader tas bort. Befintliga användardata påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleImport(); }}>
              Starta import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PlanSummary({ plan }: { plan: ImportPlan }) {
  return (
    <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
      <h4 className="text-sm font-semibold">Förhandsgranskning</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded border border-border p-2 bg-background">
          <p className="font-medium text-sm">Program</p>
          <p className="text-emerald-700">+{plan.programs.insert.length} nya</p>
          <p className="text-amber-700">~{plan.programs.update.length} uppdateras</p>
          <p className="text-muted-foreground">={plan.programs.unchanged.length} oförändrade</p>
        </div>
        <div className="rounded border border-border p-2 bg-background">
          <p className="font-medium text-sm">Kurser</p>
          <p className="text-emerald-700">+{plan.courses.insert.length} nya</p>
          <p className="text-amber-700">~{plan.courses.update.length} uppdateras</p>
          <p className="text-muted-foreground">={plan.courses.unchanged.length} oförändrade</p>
        </div>
        <div className="rounded border border-border p-2 bg-background">
          <p className="font-medium text-sm">Program-kurs-länkar</p>
          <p className="text-emerald-700">+{plan.program_courses.insert.length} nya</p>
          <p className="text-amber-700">~{plan.program_courses.update.length} uppdateras</p>
          <p className="text-muted-foreground">={plan.program_courses.unchanged.length} oförändrade</p>
          {plan.program_courses.repeated.length > 0 && (
            <p className="text-sky-700">↺ {plan.program_courses.repeated.length} valbara repetitioner</p>
          )}
          {plan.program_courses.duplicates.length > 0 && (
            <p className="text-destructive">✕ {plan.program_courses.duplicates.length} exakta dubbletter</p>
          )}
        </div>
        <div className="rounded border border-border p-2 bg-background">
          <p className="font-medium text-sm">Förkunskaper</p>
          <p className="text-emerald-700">+{plan.prerequisites.insert.length} nya</p>
          <p className="text-muted-foreground">={plan.prerequisites.duplicates.length} dubbletter</p>
          <p className="text-amber-700">!{plan.prerequisites.manual.length} manuell</p>
        </div>
      </div>
    </div>
  );
}

function ErrorList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
      <h4 className="text-sm font-semibold text-destructive flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> {title} ({items.length})
      </h4>
      <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
        {items.slice(0, 50).map((m, i) => <li key={`${m}-${i}`}>• {m}</li>)}
        {items.length > 50 && <li className="text-muted-foreground">… {items.length - 50} fler</li>}
      </ul>
    </div>
  );
}

function WarningList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
      <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> {title}
      </h4>
      <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
        {items.slice(0, 50).map((m, i) => <li key={i}>• {m}</li>)}
        {items.length > 50 && <li className="text-muted-foreground">… {items.length - 50} fler</li>}
      </ul>
    </div>
  );
}

function ResultSummary({ result }: { result: ImportResult }) {
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 space-y-2">
      <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
        <CheckCircle2 className="h-4 w-4" /> Importresultat
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <Cell label="Program" v={`+${result.programs.inserted} / ~${result.programs.updated}`} />
        <Cell label="Kurser" v={`+${result.courses.inserted} / ~${result.courses.updated}`} />
        <Cell label="Länkar" v={`+${result.program_courses.inserted} / ~${result.program_courses.updated}`} />
        <Cell label="Förkunskaper" v={`+${result.prerequisites.inserted} / skip ${result.prerequisites.skipped}`} />
      </div>
      {result.warnings.length > 0 && <WarningList title="Varningar" items={result.warnings} />}
    </div>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-border p-2 bg-background">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold">{v}</p>
    </div>
  );
}
