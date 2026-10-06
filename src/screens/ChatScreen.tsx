// Data-only chat (PLAN.md Phase 7). Questions are matched by rules in src/chat; answers are fixed
// templates over the active profile's saved values, some with an inline chart. Nothing is sent
// anywhere and no medical text is generated. The conversation is not saved.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Disclaimer from '../components/Disclaimer';
import TrendChart from '../components/TrendChart';
import { useSecureScreen } from '../components/useSecureScreen';
import { HELP_REPLY, type Answer } from '../chat/answer';
import { ask, loadMarkerIndex } from '../chat/chat';
import type { MarkerIndex } from '../chat/intent';
import { useActiveProfile, useProfiles } from '../state/ActiveProfile';
import { Button, Title } from '../ui';
import { color, radius, space, topInset } from '../ui/theme';

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
      <Title>Ask about {profile.name}’s values</Title>
      <ScrollView
        ref={scroll}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd()}
      >
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
          placeholderTextColor={color.inkFaint}
          onSubmitEditing={send}
          returnKeyType="send"
          accessibilityLabel="Question"
        />
        <Button title="Ask" disabled={!index || !text.trim()} onPress={send} style={styles.send} />
      </View>
      <Disclaimer />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xl, paddingTop: topInset, paddingBottom: space.lg, gap: space.md },
  list: { flex: 1, marginHorizontal: -space.xl },
  listContent: { gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.sm },
  bubble: { paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, maxWidth: '92%', overflow: 'hidden' },
  you: { alignSelf: 'flex-end', backgroundColor: color.primary, color: color.onPrimary, fontSize: 16, borderBottomRightRadius: 6 },
  app: { alignSelf: 'flex-start', backgroundColor: color.surface, width: '92%', borderBottomLeftRadius: 6, gap: space.sm },
  text: { fontSize: 16, lineHeight: 23, color: color.ink },
  inputRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: color.line,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontSize: 16,
    color: color.ink,
  },
  send: { paddingHorizontal: space.xl },
});
