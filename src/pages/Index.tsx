import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import AuthPage from '@/components/AuthPage';
import LandingPage from '@/components/LandingPage';
import IntroAnimation from '@/components/IntroAnimation';
import ProgramSetupPage from '@/components/ProgramSetupPage';
import CourseStatusPage from '@/components/CourseStatusPage';
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/components/Dashboard';
import AddEventPage from '@/components/AddEventPage';
import { bthPrograms } from '@/lib/programs';

import CalendarPage from '@/components/CalendarPage';
import SettingsPage from '@/components/SettingsPage';

const INTRO_KEY = 'bth_intro_shown';

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [profileData, setProfileData] = useState<{ program_name: string | null; start_year: number | null } | null>(null);
  const [catalogProgramHp, setCatalogProgramHp] = useState<number | null>(null);
  const [authView, setAuthView] = useState<null | 'login' | 'signup'>(null);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        if (event === 'SIGNED_IN' || !sessionStorage.getItem(INTRO_KEY)) {
          sessionStorage.setItem(INTRO_KEY, '1');
          setShowIntro(true);
        }
        setTimeout(() => checkProfile(session.user.id), 0);
      } else {
        setSetupComplete(null);
        setProfileData(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        if (!sessionStorage.getItem(INTRO_KEY)) {
          sessionStorage.setItem(INTRO_KEY, '1');
          setShowIntro(true);
        }
        checkProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkProfile = async (userId: string) => {
    // Self-heal in background: migrate legacy program/courses to the new catalog,
    // link existing user_courses by code, seed missing mandatory, drop unused orphans.
    // Idempotent — only runs once per user (guarded by profiles.catalog_migrated_at).
    try { await supabase.rpc('auto_sync_my_account_to_catalog' as never); } catch { /* non-fatal */ }

    const { data } = await supabase
      .from('profiles')
      .select('setup_complete, program_name, start_year')
      .eq('user_id', userId)
      .single();

    setSetupComplete(data?.setup_complete ?? false);
    setProfileData(data ? { program_name: data.program_name, start_year: data.start_year } : null);
    setLoading(false);

    // Look up total HP from catalog (covers programs that don't exist as static templates)
    if (data?.program_name) {
      const { data: prog } = await supabase
        .from('programs_catalog')
        .select('total_hp')
        .eq('name', data.program_name)
        .eq('active', true)
        .maybeSingle();
      setCatalogProgramHp(prog?.total_hp != null ? Number(prog.total_hp) : null);
    } else {
      setCatalogProgramHp(null);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem(INTRO_KEY);
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Laddar...</p>
      </div>
    );
  }

  // Not logged in
  if (!session) {
    if (authView) {
      return <AuthPage initialMode={authView} onBack={() => setAuthView(null)} />;
    }
    return (
      <LandingPage
        onLogin={() => setAuthView('login')}
        onSignup={() => setAuthView('signup')}
      />
    );
  }

  // Logged in but hasn't selected program
  if (!setupComplete) {
    return (
      <>
        {showIntro && <IntroAnimation onDone={() => setShowIntro(false)} />}
        <ProgramSetupPage
          userId={session.user.id}
          onComplete={() => {
            checkProfile(session.user.id);
          }}
        />
      </>
    );
  }

  // Compute total HP — prefer catalog (covers all imported programs), fall back to static template
  const programTemplate = bthPrograms.find(p => p.name === profileData?.program_name);
  const staticHp = programTemplate ? programTemplate.courses.reduce((s, c) => s + c.hp, 0) : undefined;
  const totalProgramHp = catalogProgramHp ?? staticHp;
  const pName = profileData?.program_name || '';

  // Main app
  return (
    <>
      {showIntro && <IntroAnimation onDone={() => setShowIntro(false)} />}
      <AppLayout programName={pName} startYear={profileData?.start_year ?? null} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard userId={session.user.id} totalProgramHp={totalProgramHp} startYear={profileData?.start_year ?? null} />} />
          <Route path="/kurser" element={<CourseStatusPage userId={session.user.id} programName={pName} />} />
          <Route path="/add-event" element={<AddEventPage userId={session.user.id} />} />
          <Route path="/kalender" element={<CalendarPage userId={session.user.id} />} />
          <Route path="/installningar" element={<SettingsPage userId={session.user.id} email={session.user.email} programName={pName} startYear={profileData?.start_year || 0} onLogout={handleLogout} onResetPlan={() => checkProfile(session.user.id)} />} />
        </Routes>
      </AppLayout>
    </>
  );
}
