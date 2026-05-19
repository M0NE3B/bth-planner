import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle2, Database, Play, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchMigrationReport, runCatalogBackfill,
  type MigrationReport, type BackfillResult,
} from '@/lib/catalogCompat';

export default function MigrationTab() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [lastBackfill, setLastBackfill] = useState<BackfillResult | null>(null);

  const load = async () => {
    setLoading(true);
    try { setReport(await fetchMigrationReport()); }
    catch (e) { toast.error(`Kunde inte hämta rapport: ${e instanceof Error ? e.message : ''}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const runBackfill = async () => {
    setRunning(true);
    try {
      const res = await runCatalogBackfill();
      setLastBackfill(res);
      toast.success(`Backfill klar: ${res.rows_linked} rader länkade`);
      await load();
    } catch (e) {
      toast.error(`Backfill misslyckades: ${e instanceof Error ? e.message : ''}`);
    } finally {
      setRunning(false);
      setConfirmOpen(false);
    }
  };

  const unmatched = report?.unmatched_user_courses ?? 0;
  const matched = report?.matched_user_courses ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-3 bg-muted/20">
        <div className="flex items-start gap-2 text-sm">
          <Database className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Säker katalogmigration</p>
            <p className="text-muted-foreground text-xs">
              Backfill länkar befintliga <code>user_courses</code> till <code>courses_catalog</code> via kurskod.
              Inga rader raderas eller skrivs om — endast den nya kolumnen <code>catalog_course_id</code> fylls i där matchning finns.
              Studentappen påverkas inte; detta är ett förberedande steg.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Hämtar rapport…' : report ? `Rapport genererad ${new Date(report.generated_at).toLocaleString('sv-SE')}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || running} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Uppdatera
          </Button>
          <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={loading || running || !report} className="gap-1">
            <Play className="h-3.5 w-3.5" /> Kör backfill
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Matchade user_courses" value={matched} tone="ok" />
        <Stat label="Omatchade user_courses" value={unmatched} tone={unmatched > 0 ? 'warn' : 'ok'} />
        <Stat label="Redan länkade" value={report?.already_linked ?? 0} />
        <Stat label="Användare berörda" value={report?.users_affected ?? 0} />
        <Stat label="Händelser bevaras" value={report?.study_events_preserved ?? 0} />
        <Stat label="Delmoment bevaras" value={report?.course_subtasks_preserved ?? 0} />
      </div>

      {lastBackfill && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" /> Senaste backfill
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>Länkade rader: <strong>{lastBackfill.rows_linked}</strong></p>
            <p>Återstående olänkade: <strong>{lastBackfill.remaining_unlinked}</strong></p>
            <p className="text-xs text-muted-foreground">Kördes {new Date(lastBackfill.ran_at).toLocaleString('sv-SE')}</p>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border border-border p-3 bg-muted/20">
        <div className="flex items-start gap-2 text-sm">
          <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div className="space-y-1 flex-1">
            <p className="font-medium">Automatisk användarsynk</p>
            <p className="text-muted-foreground text-xs">
              Befintliga användare migreras automatiskt i bakgrunden vid inloggning:
              programnamn mappas till nya katalogen, kurser kopplas via kurskod,
              saknade obligatoriska kurser läggs till och endast oanvända gamla kopplingar tas bort.
              Statusar, HP, delmoment och kalenderhändelser bevaras. Ingen åtgärd krävs.
            </p>
          </div>
        </div>
      </div>

      <Card className={unmatched > 0 ? 'border-destructive/40' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              {unmatched > 0
                ? <AlertTriangle className="h-4 w-4 text-destructive" />
                : <CheckCircle2 className="h-4 w-4 text-primary" />}
              Omatchade kurskoder
            </span>
            <Badge variant={unmatched > 0 ? 'destructive' : 'secondary'}>{report?.unmatched_codes.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!report || report.unmatched_codes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Alla kurskoder i user_courses matchar katalogen.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Dessa kurskoder används av studenter men saknas i katalogen. Lägg till dem i kurskatalogen för att möjliggöra fullständig matchning. Användare fortsätter att se sina kurser oavsett.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {report.unmatched_codes.map((code) => (
                  <Badge key={code} variant="outline" className="font-mono text-xs">{code}</Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !running && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kör katalog-backfill?</AlertDialogTitle>
            <AlertDialogDescription>
              {matched} user_courses-rader får en <code>catalog_course_id</code> baserat på kurskod.
              Inga andra fält ändras, inget raderas. Funktionen är idempotent och kan köras igen senare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void runBackfill(); }}
              disabled={running}
            >
              {running ? 'Kör…' : 'Kör backfill'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'warn' ? 'text-destructive' : tone === 'ok' ? 'text-foreground' : 'text-foreground';
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-heading text-2xl ${color}`}>{value}</div>
    </div>
  );
}
