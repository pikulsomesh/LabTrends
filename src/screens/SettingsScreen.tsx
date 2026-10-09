// Settings for the whole phone. Today: how dates are read and shown. "Automatic" follows the phone's
// region setting (Android language and region), read on the phone with no location access and no
// network. A report's own unambiguous dates still win when it is read (src/utils/dates.ts).
import { Alert, StyleSheet, View } from 'react-native';
import { useProfiles } from '../state/ActiveProfile';
import { DATE_PREF_LABEL, DATE_PREFS, deviceDateOrder, formatDate, readDate } from '../utils/dates';
import { Body, Card, Chip, Heading, Screen, Small, Title } from '../ui';
import { space } from '../ui/theme';

const SAMPLE = '01/07/2026';

export default function SettingsScreen() {
  const { datePref, dateOrder, setDatePref } = useProfiles();
  const sample = readDate(SAMPLE, { order: dateOrder });

  return (
    <Screen>
      <Title>Settings</Title>
      <Card>
        <Heading>Date order</Heading>
        <Body>
          How to read a date like {SAMPLE} on a report when the report itself does not make it clear, and how dates are
          shown in the app. You can still correct the date before saving each report.
        </Body>
        <View style={styles.choices}>
          {DATE_PREFS.map((p) => (
            <Chip
              key={p}
              label={p === 'auto' ? `Automatic (${DATE_PREF_LABEL[deviceDateOrder()].split(':')[0].toLowerCase()})` : DATE_PREF_LABEL[p]}
              selected={p === datePref}
              onPress={() => setDatePref(p).catch((e) => Alert.alert('Could not save the setting', String(e)))}
            />
          ))}
        </View>
        <Small>
          {sample ? `${SAMPLE} is read as ${formatDate(sample, 'dmy')}. ` : ''}
          Dates show like {formatDate('2026-12-31', dateOrder)}.
        </Small>
        {datePref === 'auto' && <Small>Automatic follows your phone’s language and region settings.</Small>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
