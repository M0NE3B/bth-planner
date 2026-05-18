import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import RequireAdmin from '@/components/admin/RequireAdmin';
import AdminPanel from '@/components/admin/AdminPanel';

export default function AdminPage() {
  return (
    <RequireAdmin>
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Tillbaka till appen
            </Link>
          </Button>
        </div>
        <AdminPanel />
      </div>
    </RequireAdmin>
  );
}
