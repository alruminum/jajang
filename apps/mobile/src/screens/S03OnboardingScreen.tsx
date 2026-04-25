import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>;

const SLIDES = [
  {
    id: '1',
    title: '30초 목소리로',
    body: '30초만 목소리를 들려주세요\n아기가 좋아하는 자장가가 만들어져요',
    emoji: '🎙️',
  },
  {
    id: '2',
    title: '내 목소리로 만드는',
    body: 'AI가 내 목소리로\n특별한 자장가를 만들어줘요',
    emoji: '🌙',
  },
  {
    id: '3',
    title: '편안한 수면을',
    body: '오늘 밤부터 시작해요',
    emoji: '🍃',
    isLast: true,
  },
];

export default function S03OnboardingScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NavProp>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onMomentumScrollEnd={e => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      {/* 페이지 인디케이터 */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, currentIndex === i && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA — 마지막 슬라이드에서만 표시 */}
      {currentIndex === SLIDES.length - 1 ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
            accessibilityLabel="가입하고 시작할게요"
          >
            <Text style={styles.primaryBtnText}>가입하고 시작할게요</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="이미 계정이 있어요"
          >
            <Text style={styles.secondaryLink}>이미 계정이 있어요</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="다음"
          >
            <Text style={styles.nextBtnText}>다음</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
            accessibilityLabel="건너뛰기"
          >
            <Text style={styles.skipText}>건너뛸게요</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emoji: { fontSize: 64, marginBottom: 32 },
  slideTitle: {
    fontSize: 24, fontWeight: '600', color: '#F5C97A',
    textAlign: 'center', marginBottom: 16,
  },
  slideBody: {
    fontSize: 15, color: '#7B80A0', textAlign: 'center', lineHeight: 22,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2A2E48', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#F5C97A', width: 18 },
  footer: { padding: 24 },
  primaryBtn: {
    backgroundColor: '#F5C97A', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#1A1D30', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  nextBtnText: { color: '#EEF0F8', fontSize: 16, fontWeight: '500' },
  secondaryLink: { color: '#7B80A0', textAlign: 'center', fontSize: 14, padding: 12 },
  skipText: { color: '#7B80A0', textAlign: 'center', fontSize: 14, padding: 12 },
});
