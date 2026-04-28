# 자장가 미리듣기 음원 레시피

S07 곡 선택 화면의 30s 미리듣기 음원 생성 파이프라인. PD 멜로디 + 합법 라이선스 MXL → Muse Sampler 렌더 → 후처리 → 모노 WAV.

배포 위치: `apps/api/static/previews/{key}_preview.wav`

---

## 공통 파이프라인

| 단계 | 도구 | 비고 |
|---|---|---|
| 1. 소스 | MuseScore.com (`To modify commercially` 필터) MXL 다운 | CC0 / CC-BY / CC-BY-SA만 |
| 2. 템포 조정 | MusicXML `<sound tempo="..."/>` 직접 수정 | 악보 레벨 (atempo 아티팩트 회피) |
| 3. 악기 매핑 | MusicXML `<part-name>` + `<instrument-name>` + `<midi-program>` 동시 변경 | **3개 다 바꿔야** Muse Sampler 매칭됨 |
| 4. 다중 악기 분리 렌더 | `<part>` 통째로 제거한 솔로 score를 part별 렌더 | 다이나믹 컨트롤 위해 (Muse Sampler가 `dynamics` 속성 무시) |
| 5. 템포 마킹 복사 | P1 part의 tempo direction을 P2에 inject | per-part 렌더 시 템포 누락 방지 |
| 6. ffmpeg amix 가중 믹스 | `amix weights=1.0 0.4` | 메인 100% / 반주 40% |
| 7. 리버브 | sox `reverb 5 50 20 100 5 0` (거의 dry) | 강한 리버브는 "웅웅" |
| 8. EQ + 마스터 | ffmpeg highpass + EQ + lowpass + acompressor + alimiter | |
| 9. 출력 | mono 44.1kHz s16 WAV | -15 dB 라우드니스 타깃 |

전제 조건:
- macOS + `brew install fluid-synth musescore yt-dlp sox rubberband`
- Muse Hub.app + **Muse Keys** + **Muse Harp** + **Muse Woodwinds** + **Muse Strings** + **Muse Handbells** + **Muse Guitars Vol 1** + **Muse Brass** 다운로드 완료
- python venv: `librosa`, `mido`, `music21`, `scipy`

---

## 발견된 Muse Sampler 동작 특성 (중요)

| 특성 | 비고 |
|---|---|
| `<volume>` (midi-instrument) 무시 | MIDI CC7 매핑 안 됨 |
| `<note dynamics="N">` 무시 | per-note 벨로시티 안 들음 (이상함) |
| `audiosettings.json tracks[].volumeDb` 무시 | Part eid 매칭해도 안 됨 (스키마 미공개) |
| `<part-name>`만으론 부족 | `<instrument-name>` + `<midi-program>` 도 같이 바꿔야 매칭 |
| Per-part 솔로 렌더 후 ffmpeg 믹스 | **유일하게 잘 작동하는 볼륨 컨트롤 방법** |
| Per-part 렌더 시 tempo 누락 | tempo 마킹 다른 part에 있으면 디폴트 120 BPM으로 빠르게 |

---

## Brahms Wiegenlied (Op.49 No.4) — 후보 1

**소스**: `music/lullaby-brahms-johannes-brahms.mxl` (MuseScore.com user upload, 라이선스 재확인 필요)

**최종 레시피:**

| 항목 | 값 |
|---|---|
| 템포 | **75 BPM** (원본 100의 0.75배, score-level) |
| 메인 악기 | **Muse Harp** (`pluck.harp`, GM 47) |
| 베드 악기 | **Clarinet in Bb** (`wind.reed.clarinet.b-flat`, GM 72), volume 15%, lowpass 4kHz |
| Sparkle 레이어 | Muse Harp +1옥타브 (rubberband -p 12), volume 10%, highpass 2kHz |
| 믹스 weights | Harp 1.0 / Clarinet 0.4 / Sparkle 0.3 |
| 리버브 | sox `reverb 18 50 35 100 12 0` |
| 마스터 EQ | highpass 150Hz / +3dB @ 1.5kHz / +1dB @ 400Hz / lowpass 10kHz |
| 다이나믹 | acompressor -26dB ratio 2 attack 20 release 300 makeup 10 / alimiter 0.85 |

---

## Schubert (실은 Mozart Wiegenlied K.350 by B. Flies) — 후보 1

**소스**: `music/wiegenlied-b-flies.mxl` (CC BY-SA 4.0, 편곡 메타 확인 필요)
- 원곡: B. Flies "Schlafe, mein Prinzchen" (모차르트 K.350 오인 attribution)
- 2 파트: Flute (P1) + Piano (P2), 60 BPM with rallentando 60→54→48→60

**최종 레시피:**

| 항목 | 값 |
|---|---|
| 템포 | **0.85 × 원본** (51 BPM 기준, score-level rallentando 유지) |
| P1 → 메인 | **Muse Harp** (instrument-name + midi-program 47 둘 다 변경) |
| P2 → 베드 | **Soft Piano** (Muse Keys, instrument-name 변경, midi-program 1 유지) |
| **per-part 렌더** | P1 솔로 + P2 솔로 따로 mscore 렌더 (P2엔 P1의 tempo direction inject 필수) |
| 메인 처리 (Harp) | 5kHz -4dB / 2.5kHz -2dB / lowpass 4500 / acompressor attack 80ms ratio 1.5 makeup 2 |
| 베드 볼륨 | Piano 트랙 volume=0.40 |
| 믹스 weights | Harp 1.0 / Piano 0.4 (`amix ...:normalize=1`) |
| 리버브 | sox `reverb 5 50 20 100 5 0` (거의 dry) |
| 마스터 | highpass 80Hz / +2dB @ 400Hz / lowpass 3500Hz / acompressor -30dB ratio 2 attack 40 release 400 makeup 10 / alimiter 0.78 |
| 출력 | mono 44.1kHz / 약 -15 dB |

**주의**: P1 (Flute → Harp) 변환 시 `<instrument-name>Flute</instrument-name>` 도 반드시 `Harp`로 바꿔야 함. `<part-name>` + `<midi-program>` 만 바꾸면 Muse Sampler가 instrument-name 보고 Flute로 재생.

---

## 다른 슬롯 매핑 (현재)

| 슬롯 | 소스 MXL | 악기 매핑 |
|---|---|---|
| 브람스 자장가 | (다양) | Harp + Clarinet + Sparkle |
| 모차르트 자장가 | wiegenlied-b-flies.mxl | Flute + Piano (원곡) |
| 슈베르트 자장가 | wiegenlied-b-flies.mxl | **Harp + Soft Piano 40%** ← 후보 1 |
| 반짝반짝 작은별 | wiegenlied-b-flies.mxl | Celesta |
| 자장자장(영) | brahms-lullaby-for-flute-violin-and-cello.mxl | Flute trio + EQ |

---

## 재현 명령 — 슈베르트 후보 1 (Harp + Soft Piano)

```bash
cd /tmp/jajang-audio
SRC=/Users/dc.kim/project/jajang/music/wiegenlied-b-flies.mxl

# 1) MXL 추출
mkdir -p flies_clean
unzip -o "$SRC" -d flies_clean/

# 2) Python: P1 솔로(Harp) 스코어 + P2 솔로(Soft Piano with tempo) 스코어 생성
python3 << 'EOF'
import re
with open('flies_clean/score.xml') as f:
    base = f.read()

# === P1 솔로 (Flute → Harp) ===
xml = re.sub(r'<sound tempo="([\d.]+)"/>', lambda m: f'<sound tempo="{float(m.group(1))*0.85:.4f}"/>', base)
xml = xml.replace('<part-name>Flute</part-name>', '<part-name>Harp</part-name>', 1)
xml = xml.replace('<instrument-name>Flute</instrument-name>', '<instrument-name>Harp</instrument-name>', 1)
xml = xml.replace('<midi-program>74</midi-program>', '<midi-program>47</midi-program>', 1)
xml = re.sub(r'<score-part id="P2".*?</score-part>', '', xml, flags=re.DOTALL)
xml = re.sub(r'<part id="P2">.*?</part>', '', xml, flags=re.DOTALL)
with open('flies_clean/score_harp_solo.xml', 'w') as f: f.write(xml)

# === P2 솔로 (Piano → Soft Piano + P1의 tempo direction 복사) ===
p1_body = base.split('<part id="P1">')[1].split('</part>')[0]
tempo_per_measure = {}
for num, body in re.findall(r'<measure number="(\d+)"[^>]*>(.*?)</measure>', p1_body, re.DOTALL):
    for db in re.findall(r'<direction[^>]*>.*?</direction>', body, re.DOTALL):
        if 'tempo=' in db:
            tempo_per_measure[num] = re.sub(r'tempo="([\d.]+)"',
                lambda m: f'tempo="{float(m.group(1))*0.85:.4f}"', db)
            break

p2_body = base.split('<part id="P2">')[1].split('</part>')[0]
def inject_tempo(p2):
    parts, pos = [], 0
    for m in re.finditer(r'<measure number="(\d+)"[^>]*>', p2):
        parts.append(p2[pos:m.end()])
        if m.group(1) in tempo_per_measure:
            parts.append(tempo_per_measure[m.group(1)])
        pos = m.end()
    parts.append(p2[pos:])
    return ''.join(parts)

xml = base
xml = re.sub(r'<sound tempo="([\d.]+)"/>', lambda m: f'<sound tempo="{float(m.group(1))*0.85:.4f}"/>', xml)
xml = re.sub(r'<score-part id="P1".*?</score-part>', '', xml, flags=re.DOTALL)
xml = re.sub(r'<part id="P1">.*?</part>', '', xml, flags=re.DOTALL)
xml = xml.replace('<part-name>Piano</part-name>', '<part-name>Soft Piano</part-name>')
xml = xml.replace('<instrument-name>Piano</instrument-name>', '<instrument-name>Soft Piano</instrument-name>')
xml = xml.replace('<part id="P2">' + p2_body + '</part>',
                  '<part id="P2">' + inject_tempo(p2_body) + '</part>')
with open('flies_clean/score_softp_solo.xml', 'w') as f: f.write(xml)
EOF

# 3) 각각 mscore 렌더 (Muse Sampler 자동)
mscore -o harp.wav flies_clean/score_harp_solo.xml
mscore -o softp.wav flies_clean/score_softp_solo.xml

# 4) Harp 처리: 부드럽게 + 30s 트림
ffmpeg -y -i harp.wav -t 30 \
  -af "afade=t=in:st=0:d=1.5,afade=t=out:st=28.5:d=1.5,equalizer=f=5000:t=q:w=1.5:g=-4,equalizer=f=2500:t=q:w=2:g=-2,lowpass=f=4500,acompressor=threshold=-30dB:ratio=1.5:attack=80:release=400:makeup=2" \
  -ar 44100 hp.wav

# 5) Soft Piano: 40% 볼륨
ffmpeg -y -i softp.wav -t 30 \
  -af "afade=t=in:st=0:d=1.5,afade=t=out:st=28.5:d=1.5,volume=0.40" -ar 44100 sp.wav

# 6) 가중 믹스
ffmpeg -y -i hp.wav -i sp.wav \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:weights=1.0 0.4:normalize=1[out]" \
  -map "[out]" -ar 44100 mix.wav

# 7) 약한 리버브
sox mix.wav verb.wav reverb 5 50 20 100 5 0

# 8) 마스터링
ffmpeg -y -i verb.wav \
  -af "volume=8dB,highpass=f=80,equalizer=f=400:t=q:w=1:g=2,lowpass=f=3500,acompressor=threshold=-30dB:ratio=2:attack=40:release=400:makeup=10,alimiter=limit=0.78" \
  -ar 44100 -ac 1 \
  /Users/dc.kim/project/jajang/apps/api/static/previews/schubert_preview.wav
```

---

## 다른 곡 진행 절차

1. MuseScore.com → "To modify commercially" 필터 → 곡 검색
2. 라이선스 (CC0 / CC-BY / CC-BY-SA) + 편곡자 이름 메모
3. MXL 다운 → `music/{song-name}.mxl`
4. 위 레시피 응용 (악기·템포·믹스 weights 곡 톤에 맞춰 미세 조정)
5. 곡별 출력: `apps/api/static/previews/{key}_preview.wav`
   - keys: `brahms` / `mozart` / `schubert` / `twinkle` / `rockabye` / `hush`

---

## 미해결 / 향후 작업

- [ ] 라이선스 명시: 각 MXL의 정확한 CC 종류 + 편곡자 이름을 별도 파일에 기록 (앱 크레딧 화면 연동)
- [ ] 악기 선택 기능 (사용자 토글로 Harp/Piano/Music Box 등 — 별개 에픽)
- [ ] 노트 밀도 보강 (아르페지오 반주 추가)
- [ ] 6곡 일괄 처리 스크립트 (현재 슬롯별 수동)
- [ ] Muse Sampler 다이나믹 컨트롤 — audiosettings.json 스키마 리버스 엔지니어링 또는 GUI 자동화로 정확한 트랙 볼륨 설정 (현재는 per-part 렌더로 회피)
