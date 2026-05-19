import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck } from 'lucide-react';
import CourseCatalogTab from './CourseCatalogTab';
import ProgramsTab from './ProgramsTab';
import ImportTab from './ImportTab';
import AdminsTab from './AdminsTab';
import DataQualityTab from './DataQualityTab';
import PrerequisitesTab from './PrerequisitesTab';

export default function AdminPanel() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-base font-semibold">Administration</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Hantera kurskatalogen, program och förkunskapskrav. Endast administratörer ser denna sektion.
      </p>
      <Tabs defaultValue="courses" className="w-full">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
          <TabsTrigger value="courses">Kurskatalog</TabsTrigger>
          <TabsTrigger value="programs">Program</TabsTrigger>
          <TabsTrigger value="prereqs">Förkunskaper</TabsTrigger>
          <TabsTrigger value="quality">Datakvalitet</TabsTrigger>
          <TabsTrigger value="import">Import (JSON)</TabsTrigger>
          <TabsTrigger value="admins">Administratörer</TabsTrigger>
        </TabsList>
        <TabsContent value="courses" className="mt-4"><CourseCatalogTab /></TabsContent>
        <TabsContent value="programs" className="mt-4"><ProgramsTab /></TabsContent>
        <TabsContent value="prereqs" className="mt-4"><PrerequisitesTab /></TabsContent>
        <TabsContent value="quality" className="mt-4"><DataQualityTab /></TabsContent>
        <TabsContent value="import" className="mt-4"><ImportTab /></TabsContent>
        <TabsContent value="admins" className="mt-4"><AdminsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
