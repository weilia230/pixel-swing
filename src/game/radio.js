// 黄昏电台：独立于电脑界面的单例播放器，关电脑或离椅后仍作为背景音乐继续播放。
const listeners = new Set();

export const radio = {
  tracks: [], // { id, name, url }
  currentId: null,
  playing: false,
  loop: false,
};

let audio = null;
let nextId = 1;

function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.addEventListener('ended', () => {
      if (radio.loop && radio.currentId != null) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      radio.playing = false;
      notify();
    });
  }
  return audio;
}

export function subscribeRadio(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function addTracks(files) {
  const added = Array.from(files)
    .filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name))
    .map((file) => ({
      id: nextId++,
      name: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
    }));
  radio.tracks = [...radio.tracks, ...added];
  notify();
  return added;
}

export function playTrack(id) {
  const track = radio.tracks.find((item) => item.id === id);
  if (!track) return;
  const player = getAudio();
  radio.currentId = id;
  radio.playing = true;
  player.src = track.url;
  player.loop = false;
  player.play().catch(() => {
    radio.playing = false;
    notify();
  });
  notify();
}

export function togglePlay() {
  if (radio.currentId == null) {
    if (radio.tracks[0]) playTrack(radio.tracks[0].id);
    return;
  }
  const player = getAudio();
  if (radio.playing) {
    player.pause();
    radio.playing = false;
  } else {
    player.play().catch(() => {});
    radio.playing = true;
  }
  notify();
}

export function setLoop(value) {
  radio.loop = value;
  notify();
}

export function currentTrack() {
  return radio.tracks.find((item) => item.id === radio.currentId) || null;
}
