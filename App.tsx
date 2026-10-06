import { useCallback, useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { openDatabase, type Db } from './src/db';
import { sweepIngestCache } from './src/ingest/native';
import BackupScreen from './src/screens/BackupScreen';
import ChatScreen from './src/screens/ChatScreen';
import IngestScreen from './src/screens/IngestScreen';
import MarkerScreen from './src/screens/MarkerScreen';
import ProfileHomeScreen from './src/screens/ProfileHomeScreen';
import ProfilesScreen from './src/screens/ProfilesScreen';
import SpikeScreen from './src/spike/SpikeScreen';
import { ActiveProfileProvider, useProfiles } from './src/state/ActiveProfile';
import { canGoBack, currentRoute, initialNav, navReducer } from './src/state/navigation';
import { loadSession, type Session } from './src/state/session';
import { color } from './src/ui/theme';

type Boot = { db: Db; session: Session } | { error: string } | null;

export default function App() {
  const [boot, setBoot] = useState<Boot>(null);

  useEffect(() => {
    // Guardrail 2: remove report files or page images an interrupted import left in the cache.
    sweepIngestCache();
    openDatabase()
      .then(async (db) => setBoot({ db, session: await loadSession(db) }))
      .catch((e) => setBoot({ error: e instanceof Error ? e.message : String(e) }));
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      {boot == null ? (
        <View style={styles.center}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : 'error' in boot ? (
        <View style={styles.center}>
          <Text style={styles.error}>Could not open the database: {boot.error}</Text>
        </View>
      ) : (
        <ActiveProfileProvider db={boot.db} initial={boot.session}>
          <Navigator initialActiveId={boot.session.activeId} />
        </ActiveProfileProvider>
      )}
    </>
  );
}

function Navigator({ initialActiveId }: { initialActiveId: number | null }) {
  const { active } = useProfiles();
  const [nav, dispatch] = useReducer(navReducer, initialActiveId, initialNav);
  const route = currentRoute(nav);
  const goBack = useCallback(() => dispatch({ type: 'back' }), []);

  // Android back button: pop a screen, or let the system leave the app from the landing screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack(nav)) return false;
      dispatch({ type: 'back' });
      return true;
    });
    return () => sub.remove();
  }, [nav]);

  if (route.name === 'spike' && __DEV__) return <SpikeScreen />;
  if (route.name === 'ingest' && active) return <IngestScreen onDone={goBack} />;
  if (route.name === 'marker' && active) return <MarkerScreen markerKey={route.key} onEmpty={goBack} />;
  if (route.name === 'chat' && active) return <ChatScreen />;
  if (route.name === 'backup') return <BackupScreen />;
  if (route.name === 'profileHome' && active) {
    return (
      <ProfileHomeScreen
        onSwitchProfile={() => dispatch({ type: 'closeProfile' })}
        onAddReport={() => dispatch({ type: 'openIngest' })}
        onOpenMarker={(key) => dispatch({ type: 'openMarker', key })}
        onOpenChat={() => dispatch({ type: 'openChat' })}
      />
    );
  }
  return (
    <ProfilesScreen
      onOpenProfile={() => dispatch({ type: 'openProfile' })}
      onOpenBackup={() => dispatch({ type: 'openBackup' })}
      onOpenSpike={__DEV__ ? () => dispatch({ type: 'openSpike' }) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: color.bg },
  error: { color: color.danger, textAlign: 'center' },
});
