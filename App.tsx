import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { openDatabase, type Db } from './src/db';
import ProfileHomeScreen from './src/screens/ProfileHomeScreen';
import ProfilesScreen from './src/screens/ProfilesScreen';
import SpikeScreen from './src/spike/SpikeScreen';
import { ActiveProfileProvider, useProfiles } from './src/state/ActiveProfile';
import { canGoBack, currentRoute, initialNav, navReducer } from './src/state/navigation';
import { loadSession, type Session } from './src/state/session';

type Boot = { db: Db; session: Session } | { error: string } | null;

export default function App() {
  const [boot, setBoot] = useState<Boot>(null);

  useEffect(() => {
    openDatabase()
      .then(async (db) => setBoot({ db, session: await loadSession(db) }))
      .catch((e) => setBoot({ error: e instanceof Error ? e.message : String(e) }));
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      {boot == null ? (
        <View style={styles.center}>
          <ActivityIndicator />
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
  if (route.name === 'profileHome' && active) {
    return <ProfileHomeScreen onSwitchProfile={() => dispatch({ type: 'closeProfile' })} />;
  }
  return (
    <ProfilesScreen
      onOpenProfile={() => dispatch({ type: 'openProfile' })}
      onOpenSpike={__DEV__ ? () => dispatch({ type: 'openSpike' }) : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#b00020', textAlign: 'center' },
});
