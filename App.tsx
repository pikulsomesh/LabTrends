import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import SpikeScreen from './src/spike/SpikeScreen';

export default function App() {
  const [spike, setSpike] = useState(false);
  return (
    <>
      <StatusBar style="auto" />
      {__DEV__ && spike ? (
        <SpikeScreen />
      ) : (
        <HomeScreen onOpenSpike={__DEV__ ? () => setSpike(true) : undefined} />
      )}
    </>
  );
}
