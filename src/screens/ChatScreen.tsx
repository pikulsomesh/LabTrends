// Data-only chat (PLAN.md Phase 7). Questions are matched by rules in src/chat; answers are fixed
// templates over the active profile's saved values, some with an inline chart. Nothing is sent
// anywhere and no medical text is generated. The conversation is not saved.
import { useEffect, useRef, useState } from 'react';
import { Button, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';
import TrendChart from '../components/TrendChart';
import { useSecureScreen } from '../components/useSecureScreen';
import { HELP_REPLY, type Answer } from '../chat/answer';
import { ask, loadMarkerIndex } from '../chat/chat';
import type { MarkerIndex } from '../chat/intent';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';

type Message = { from: 'you'; text: string } | { from: 'app'; answer: Answer };

export default function ChatScreen() {
  useSecureScreen();
  const { db } = useProfiles();
  const profile = useActiveProfile();
  const [index, setIndex] = useState<MarkerIndex | null>(null);
  const [messages, setMessages] = useState<Message[]>([{ from: 'app', answer: { text: HELP_REPLY } }]);
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    loadMarkerIndex(db, profile.id).then((i) => live && setIndex(i));
    return () => {
      live = false;
    };
  }, [db, profile.id]);

  async function send() {
    const q = text.trim();
    if (!q || !index) return;
    setText('');
    setMessages((m) => [...m, { from: 'you', text: q }]);
    try {
      const answers = await ask(db, profile.id, index, q);
      setMessages((m) => [...m, ...answers.map((answer) => ({ from: 'app' as const, answer }))]);
    } catch (e) {
      setMessages((m) => [...m, { from: 'app', answer: { text: `Something went wrong reading your data: ${String(e)}` } }]);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior="height">
      <Text style={styles.title}>Ask about {profile.name}’s values</Text>
      <ScrollView ref={scroll} style={styles.list} contentContainerStyle={styles.listContent} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        {messages.map((m, i) =>
          m.from === 'you' ? (
            <Text key={i} style={[styles.bubble, styles.you]}>
              {m.text}
            </Text>
          ) : (
            <View key={i} style={[styles.bubble, styles.app]}>
              <Text style={styles.text}>{m.answer.text}</Text>
              {m.answer.chart && <TrendChart points={m.answer.chart.points} />}
            </View>
          ),
        )}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="e.g. ALT trend"
          onSubmitEditing={send}
          returnKeyType="send"
          accessibilityLabel="Question"
        />
        <Button title="Ask" disabled={!index || !text.trim()} onPress={send} />
      </View>
      <Disclaimer />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, paddingTop: 48, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { gap: 8, paddingBottom: 8 },
  bubble: { padding: 10, borderRadius: 10, maxWidth: '92%' },
  you: { alignSelf: 'flex-end', backgroundColor: '#1f5fa8', color: '#fff', fontSize: 15 },
  app: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0', width: '92%' },
  text: { fontSize: 15, color: '#111' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#bbb', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: '#111' },
});
