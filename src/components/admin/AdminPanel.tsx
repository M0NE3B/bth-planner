import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck } from 'lucide-react';
import CourseCatalogTab from './CourseCatalogTab';
import ProgramsTab from './ProgramsTab';
import ImportTab from './ImportTab';

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
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="courses">Kurskatalog</TabsTrigger>
          <TabsTrigger value="programs">Program</TabsTrigger>
          <TabsTrigger value="import">Import & verktyg</TabsTrigger>
        </TabsList>
        <TabsContent value="courses" className="mt-4">
          <CourseCatalogTab />
        </TabsContent>
        <TabsContent value="programs" className="mt-4">
          <ProgramsTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
