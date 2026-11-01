import { useRef, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type TextStyle, type ViewStyle, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Sora_500Medium, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { colors, fonts, MAX_WIDTH } from './src/theme';
import { Logo, Mark } from './src/components/Logo';
import { PartnerIcon } from './src/components/Icons';
import { HeroBackground } from './src/components/HeroBackground';
import { about, approach, contact, CONTACT_EMAIL, hero, nav, partners, pillars, principles, programs, type SectionId } from './src/content';

export default function App() {
  const [fontsLoaded] = useFonts({ Sora_500Medium, Sora_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Partial<Record<SectionId, number>>>({});

  const go = (id: SectionId) => scrollRef.current?.scrollTo({ y: offsets.current[id] ?? 0, animated: true });
  const mark = (id: SectionId) => (e: { nativeEvent: { layout: { y: number } } }) => {
    offsets.current[id] = e.nativeEvent.layout.y;
  };

  const narrow = width < 760;
  const h1 = Math.max(40, Math.min(88, width * 0.064));
  const h2 = Math.max(30, Math.min(48, width * 0.036));
  const pad = narrow ? 72 : 112;

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.ink }} />;

  const H2 = ({ children, color = colors.ink }: { children: ReactNode; color?: string }) => (
    <Text accessibilityRole="header" aria-level={2} style={[s.h2, { fontSize: h2, lineHeight: h2 * 1.1, color }]}>
      {children}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StatusBar style="light" />
      <ScrollView ref={scrollRef}>
        {/* Header */}
        <View style={{ backgroundColor: colors.ink, borderBottomWidth: 1, borderBottomColor: '#262626' }}>
          <Container style={[s.row, { paddingVertical: 18, justifyContent: 'space-between', gap: 16 }]}>
            <Pressable accessibilityRole="link" accessibilityLabel="Oivuni AI home" onPress={() => go('top')}>
              <Logo />
            </Pressable>
            <View style={[s.row, { gap: narrow ? 8 : 28, flexShrink: 1 }, narrow && { width: '100%', columnGap: 18 }]}>
              {nav.map((n) => (
                <Pressable key={n.label} accessibilityRole="link" onPress={() => go(n.target)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={s.navLink}>{n.label}</Text>
                </Pressable>
              ))}
              {narrow ? null : <Button label="Start a conversation" onPress={() => go('contact')} small />}
            </View>
          </Container>
        </View>

        {/* Hero */}
        <View onLayout={mark('top')} style={{ backgroundColor: '#070A14', overflow: 'hidden', position: 'relative' }}>
          <HeroBackground compact={narrow} />
          <Container
            style={{
              maxWidth: 1480,
              paddingHorizontal: narrow ? 24 : Math.round(Math.min(72, Math.max(32, width * 0.04))),
              minHeight: narrow ? undefined : Math.max(620, height - 81),
              justifyContent: 'center',
              paddingTop: narrow ? 56 : 56,
              paddingBottom: narrow ? 72 : 72,
              gap: 32,
              position: 'relative',
            }}
          >
            <Text style={[s.eyebrow, { color: colors.accentOnDark }]}>{hero.eyebrow}</Text>
            <Text accessibilityRole="header" aria-level={1} style={[s.h1, { fontSize: h1, lineHeight: h1 * 1.04, maxWidth: 960 }]}>
              {hero.title}
            </Text>
            <Text style={[s.lead, { color: colors.muted, maxWidth: 720 }]}>{hero.body}</Text>
            <View style={[s.row, { gap: 14 }]}>
              <Button label="Partner with us" onPress={() => go('partners')} />
              <Button label="Explore our research" onPress={() => go('research')} outline />
            </View>
          </Container>
        </View>

        {/* Operating pillars */}
        <Section id="solutions" onLayout={mark('solutions')} bg={colors.grey} pad={pad}>
          <View style={{ gap: 16, maxWidth: 720 }}>
            <Text style={s.eyebrow}>HOW WE OPERATE</Text>
            <H2>One path from research to product.</H2>
          </View>
          <Grid>
            {pillars.map((p) => {
              const dark = Boolean(p.dark);
              return (
                <View key={p.title} style={[s.card, { backgroundColor: dark ? colors.ink : colors.white, flexBasis: 320 }]}>
                  <Text style={[s.stepNum, { color: dark ? colors.accentOnDark : colors.accentText }]}>{p.number}</Text>
                  <Text style={[s.h3, { fontSize: 26, color: dark ? colors.white : colors.ink }]}>{p.title}</Text>
                  <Text style={[s.body, { color: dark ? colors.muted : colors.body }]}>{p.body}</Text>
                  <TextLink label={p.link.label} onPress={() => go(p.link.target)} color={dark ? colors.accentOnDark : colors.accentText} />
                </View>
              );
            })}
          </Grid>
        </Section>

        {/* Approach */}
        <Section id="approach" onLayout={mark('approach')} bg={colors.white} pad={pad}>
          <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end', gap: 32 }]}>
            <View style={{ maxWidth: 620, flexShrink: 1 }}>
              <H2>{approach.title}</H2>
            </View>
            <Text style={[s.bodyLg, { maxWidth: 440 }]}>{approach.body}</Text>
          </View>
          <Grid>
            {approach.steps.map((st) => (
              <View key={st.title} style={{ flexBasis: 240, flexGrow: 1, borderTopWidth: 2, borderTopColor: colors.ink, paddingTop: 22, gap: 10 }}>
                <Text style={[s.stepNum, { color: colors.accentText }]}>{st.number}</Text>
                <Text style={[s.h3, { fontSize: 22 }]}>{st.title}</Text>
                <Text style={s.body}>{st.body}</Text>
              </View>
            ))}
          </Grid>
        </Section>

        {/* Research programs */}
        <Section id="research" onLayout={mark('research')} bg={colors.grey} pad={pad}>
          <View style={{ gap: 16, maxWidth: 760 }}>
            <Text style={s.eyebrow}>RESEARCH PROGRAMS</Text>
            <H2>{programs.title}</H2>
            <Text style={s.bodyLg}>{programs.body}</Text>
          </View>
          <Grid>
            {programs.items.map((p) => {
              const dark = Boolean(p.featured);
              return (
                <View
                  key={p.title}
                  style={[s.card, { flexBasis: 320, backgroundColor: dark ? colors.ink : colors.white, borderWidth: dark ? 0 : 1, borderColor: colors.border }]}
                >
                  <Text style={[s.chip, { backgroundColor: dark ? colors.accentOnDark : colors.chip }]}>{p.status}</Text>
                  <Text style={[s.h3, { fontSize: 26, color: dark ? colors.white : colors.ink }]}>{p.title}</Text>
                  <Text style={[s.body, { color: dark ? colors.muted : colors.body }]}>{p.body}</Text>
                  <TextLink label={p.link} onPress={() => go('contact')} color={dark ? colors.accentOnDark : colors.accentText} />
                </View>
              );
            })}
          </Grid>
        </Section>

        {/* Partnerships */}
        <Section id="partners" onLayout={mark('partners')} bg={colors.white} pad={pad}>
          <View style={{ gap: 16, maxWidth: 720 }}>
            <Text style={s.eyebrow}>PARTNERSHIPS</Text>
            <H2>{partners.title}</H2>
          </View>
          <Grid gap={40}>
            {partners.items.map((p) => (
              <View key={p.title} style={{ flexBasis: 280, flexGrow: 1, gap: 12 }}>
                <PartnerIcon name={p.icon} />
                <Text style={[s.h3, { fontSize: 22 }]}>{p.title}</Text>
                <Text style={s.body}>{p.body}</Text>
              </View>
            ))}
          </Grid>
        </Section>

        {/* About */}
        <Section id="about" onLayout={mark('about')} bg={colors.grey} pad={pad}>
          <View style={{ gap: 16, maxWidth: 760 }}>
            <Text style={s.eyebrow}>ABOUT</Text>
            <H2>{about.title}</H2>
            <Text style={s.bodyLg}>{about.body}</Text>
          </View>
          <Grid>
            {about.founders.map((f, i) => (
              <View key={i} style={[s.card, { flexBasis: 320, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, gap: 16 }]}>
                <View style={[s.row, { gap: 16, flexWrap: 'nowrap' }]}>
                  <View style={s.photo}>
                    <Text style={{ fontFamily: fonts.body, fontSize: 12, color: '#5C5C5C' }}>[Photo]</Text>
                  </View>
                  <View style={{ gap: 4, flexShrink: 1 }}>
                    <Text style={[s.h3, { fontSize: 20 }]}>{f.name}</Text>
                    <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accentText }}>{f.role}</Text>
                  </View>
                </View>
                <Detail label="Education" value={f.education} />
                <Detail label="Research" value={f.research} />
                <Detail label="Experience" value={f.experience} />
                <TextLink label={`${f.profileLabel} →`} onPress={() => f.profileUrl && Linking.openURL(f.profileUrl)} />
              </View>
            ))}
          </Grid>
        </Section>

        {/* Principles */}
        <Section bg={colors.white} pad={pad}>
          <H2>What we hold ourselves to</H2>
          <Grid>
            {principles.map((p) => (
              <View key={p.title} style={[s.card, { flexBasis: 280, borderWidth: 1, borderColor: colors.border, gap: 10 }]}>
                <Text style={[s.h3, { fontSize: 22 }]}>{p.title}</Text>
                <Text style={s.body}>{p.body}</Text>
              </View>
            ))}
          </Grid>
        </Section>

        {/* Contact */}
        <View onLayout={mark('contact')} style={{ backgroundColor: colors.ink }}>
          <Container style={[s.row, { paddingVertical: narrow ? 72 : 104, justifyContent: 'space-between', gap: 32 }]}>
            <View style={{ gap: 16, maxWidth: 680, flexShrink: 1 }}>
              <H2 color={colors.white}>{contact.title}</H2>
              <Text style={[s.lead, { color: colors.muted, fontSize: 18 }]}>{contact.body}</Text>
            </View>
            {CONTACT_EMAIL ? <Button label={contact.button} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} /> : null}
          </Container>
        </View>

        {/* Footer */}
        <View style={{ backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: '#262626' }}>
          <Container style={[s.row, { paddingTop: 56, paddingBottom: 32, justifyContent: 'space-between', gap: 40, alignItems: 'flex-start' }]}>
            <View style={{ gap: 14, maxWidth: 320 }}>
              <View style={[s.row, { gap: 10 }]}>
                <Mark size={26} />
                <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.white }}>
                  oivuni <Text style={{ fontFamily: fonts.displayMedium, fontSize: 13, color: colors.accentOnDark }}>AI</Text>
                </Text>
              </View>
              <Text style={[s.small, { color: colors.footerText }]}>Applied AI research and commercialization.</Text>
            </View>
            <View style={[s.row, { gap: 56, alignItems: 'flex-start' }]}>
              <FooterCol title="COMPANY" links={[['About', 'about'], ['Contact', 'contact']]} go={go} />
              <FooterCol title="WORK" links={[['Research', 'research'], ['Solutions & Products', 'solutions'], ['Partnerships', 'partners']]} go={go} />
            </View>
          </Container>
          <Container style={{ paddingBottom: 40 }}>
            <Text style={[s.small, { color: colors.footerText, fontSize: 13 }]}>© {new Date().getFullYear()} Oivuni AI. All rights reserved.</Text>
          </Container>
        </View>
      </ScrollView>
    </View>
  );
}

function Container({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 24 }, style as ViewStyle]}>{children}</View>;
}

function Section({ children, bg, pad, onLayout }: { id?: SectionId; children: ReactNode; bg: string; pad: number; onLayout?: (e: { nativeEvent: { layout: { y: number } } }) => void }) {
  return (
    <View onLayout={onLayout} style={{ backgroundColor: bg }}>
      <Container style={{ paddingVertical: pad, gap: 48 }}>{children}</Container>
    </View>
  );
}

function Grid({ children, gap = 20 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

function Button({ label, onPress, outline, small }: { label: string; onPress: () => void; outline?: boolean; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        {
          backgroundColor: outline ? 'transparent' : colors.accent,
          borderWidth: outline ? 1 : 0,
          borderColor: '#5A5A5A',
          paddingVertical: small ? 12 : 16,
          paddingHorizontal: small ? 20 : 26,
          borderRadius: 8,
          minHeight: 44,
          justifyContent: 'center',
          opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
        },
      ]}
    >
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: small ? 15 : 16, color: outline ? colors.white : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function TextLink({ label, onPress, color = colors.accentText }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={{ marginTop: 'auto', paddingTop: 8 }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color }}>{label}</Text>
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink }}>{label}</Text>
      <Text style={[s.body, { fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

function FooterCol({ title, links, go }: { title: string; links: [string, SectionId][]; go: (id: SectionId) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1, color: colors.white }}>{title}</Text>
      {links.map(([label, target]) => (
        <Pressable key={label} accessibilityRole="link" onPress={() => go(target)}>
          <Text style={[s.small, { color: colors.footerText }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  navLink: { fontFamily: fonts.body, fontSize: 15, color: '#E6E6E6' },
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 14, letterSpacing: 1.7, color: colors.accentText },
  h1: { fontFamily: fonts.display, color: colors.white, letterSpacing: -2 } as TextStyle,
  h2: { fontFamily: fonts.display, letterSpacing: -1 } as TextStyle,
  h3: { fontFamily: fonts.display, color: colors.ink, lineHeight: undefined } as TextStyle,
  lead: { fontFamily: fonts.body, fontSize: 20, lineHeight: 32 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26, color: colors.body },
  bodyLg: { fontFamily: fonts.body, fontSize: 17, lineHeight: 27, color: colors.body },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  stepNum: { fontFamily: fonts.display, fontSize: 15 },
  card: { flexGrow: 1, borderRadius: 16, padding: 32, gap: 14 },
  chip: { alignSelf: 'flex-start', fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  photo: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
});
