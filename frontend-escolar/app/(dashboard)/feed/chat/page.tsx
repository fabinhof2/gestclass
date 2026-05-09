"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ImagePlus,
  Mic,
  MoreVertical,
  Music,
  Pause,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Smile,
  Square,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, apiUrl } from "@/lib/api";
import {
  communicationBackgroundKey,
  communicationBackgroundOptions,
} from "@/lib/communication-background";
import { useAuth, UserRole } from "@/context/auth-context";

type Pessoa = {
  id: string;
  name: string;
  role: UserRole;
  fotoUrl?: string | null;
};

type Grupo = {
  id: string;
  nome: string;
  tipo?: string;
  turma?: { id: string; name: string; turno?: string | null } | null;
  membros: Array<{ user: Pessoa }>;
  totalMensagens?: number;
  totalPosts?: number;
  _count?: {
    mensagens?: number;
    posts?: number;
  };
};

const COLABORADORES_GROUP_NAME = "Colaboradores";

type Mensagem = {
  id: string;
  texto: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  createdAt: string;
  author: Pessoa;
};

type StickerItem = {
  id: string;
  label: string;
  face: string;
  accent: string;
  caption: string;
  mood: string;
  frame?: "card" | "cutout" | "photo" | "character";
};

type SoundEffectItem = {
  id: string;
  label: string;
  phrase: string;
  icon: string;
  accent: string;
};

function unreadMessagesKey(userId?: string) {
  return `gestclass_chat_unread_groups_${userId || "anon"}`;
}

function formatAudioDuration(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function VoiceMessagePlayer({
  src,
  isMine,
  timeLabel,
}: {
  src: string;
  isMine: boolean;
  timeLabel: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const waveform = [8, 14, 22, 30, 18, 26, 36, 24, 20, 34, 28, 16, 10, 22, 32, 18, 26, 12, 8];
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => setDuration(audio.duration || 0);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  async function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {}
  }

  return (
    <div
      className={`mt-1 w-[320px] max-w-full rounded-[1.7rem] px-4 py-3 ${
        isMine ? "bg-[#d9fdd3]" : "bg-white"
      }`}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAudio}
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isMine ? "bg-[#ecfdf3]" : "bg-[#f0f2f5]"
          } text-slate-900`}
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="flex-1">
          <div className="flex h-10 items-center gap-[3px]">
            {waveform.map((bar, index) => {
              const active = index / waveform.length <= progress;
              return (
                <span
                  key={`${bar}-${index}`}
                  className={`rounded-full ${
                    active ? "bg-[#53bdeb]" : "bg-slate-300/90"
                  }`}
                  style={{ width: 4, height: bar }}
                />
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{formatAudioDuration(playing ? currentTime : duration || currentTime)}</span>
            <span>{timeLabel}</span>
          </div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#00a884] shadow-sm">
          <Mic size={18} />
        </div>
      </div>
    </div>
  );
}

const EMOJI_GROUPS = [
  {
    label: "Carinhas",
    items: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😂",
      "🤣",
      "😊",
      "😍",
      "🥰",
      "😘",
      "😎",
      "🤩",
      "🥳",
      "😇",
      "🤔",
      "😅",
      "😭",
      "😡",
      "😴",
    ],
  },
  {
    label: "Gestos",
    items: [
      "👍",
      "👎",
      "👏",
      "🙌",
      "🙏",
      "🤝",
      "💪",
      "✍️",
      "👀",
      "🫶",
      "🤌",
      "👌",
      "✌️",
      "🤟",
      "👋",
    ],
  },
  {
    label: "Escola",
    items: [
      "📚",
      "✏️",
      "📝",
      "📌",
      "📎",
      "📅",
      "⏰",
      "⭐",
      "✅",
      "🏆",
      "🎉",
      "🔥",
      "💡",
      "🎧",
      "🎵",
    ],
  },
];

const SPECIALS = ["@", "#", "º", "ª", "ç", "ã", "õ", "á", "é", "í", "ó", "ú", "ñ", "¿", "!", "?"];

const STICKER_SEEDS: StickerItem[] = [
  { id: "arrasou", label: "Arrasou", face: "🌟", accent: "from-amber-200 via-yellow-300 to-orange-300", caption: "ARRASOU!", mood: "⭐" },
  { id: "parabens", label: "Parabéns", face: "🥳", accent: "from-fuchsia-200 via-pink-300 to-rose-300", caption: "PARABÉNS", mood: "🎉" },
  { id: "aplausos", label: "Aplausos", face: "👏", accent: "from-amber-100 via-orange-200 to-red-300", caption: "APLAUSOS", mood: "✨" },
  { id: "top-demais", label: "Top demais", face: "🚀", accent: "from-sky-200 via-blue-300 to-indigo-400", caption: "TOP!", mood: "💫" },
  { id: "nota-dez", label: "Nota 10", face: "🔟", accent: "from-emerald-200 via-lime-300 to-green-400", caption: "NOTA 10", mood: "🏆" },
  { id: "aprovado", label: "Aprovado", face: "✅", accent: "from-green-200 via-emerald-300 to-teal-400", caption: "APROVADO", mood: "🎓" },
  { id: "presente", label: "Presente", face: "🙋", accent: "from-cyan-100 via-sky-200 to-blue-300", caption: "PRESENTE", mood: "📍" },
  { id: "tarefa-feita", label: "Tarefa feita", face: "📝", accent: "from-lime-100 via-green-200 to-emerald-300", caption: "FEITO!", mood: "✅" },
  { id: "estudando", label: "Estudando", face: "📚", accent: "from-emerald-100 via-teal-200 to-cyan-300", caption: "ESTUDANDO", mood: "💡" },
  { id: "foco", label: "Foco", face: "🎯", accent: "from-red-100 via-rose-200 to-pink-300", caption: "FOCO", mood: "⚡" },
  { id: "bora", label: "Bora", face: "💪", accent: "from-orange-100 via-amber-200 to-yellow-300", caption: "BORA!", mood: "🔥" },
  { id: "duvida", label: "Dúvida", face: "🤔", accent: "from-violet-100 via-purple-200 to-fuchsia-300", caption: "DÚVIDA", mood: "?" },
  { id: "socorro-prova", label: "Socorro prova", face: "😅", accent: "from-slate-100 via-blue-200 to-cyan-300", caption: "EITA PROVA", mood: "📄" },
  { id: "calma", label: "Calma", face: "😌", accent: "from-teal-100 via-cyan-200 to-sky-300", caption: "CALMA", mood: "🍃" },
  { id: "risada", label: "Risada", face: "😂", accent: "from-yellow-100 via-amber-200 to-orange-300", caption: "HAHAHA", mood: "🤣" },
  { id: "uau", label: "Uau", face: "🤩", accent: "from-indigo-100 via-violet-200 to-purple-300", caption: "UAU!", mood: "✨" },
  { id: "obrigado", label: "Obrigado", face: "🙏", accent: "from-blue-100 via-indigo-200 to-violet-300", caption: "OBRIGADO", mood: "💙" },
  { id: "combinado", label: "Combinado", face: "🤝", accent: "from-violet-100 via-indigo-200 to-blue-300", caption: "COMBINADO", mood: "👍" },
  { id: "cheguei", label: "Cheguei", face: "👋", accent: "from-pink-100 via-rose-200 to-orange-300", caption: "CHEGUEI", mood: "✨" },
  { id: "bom-dia", label: "Bom dia", face: "🌞", accent: "from-yellow-100 via-orange-200 to-amber-300", caption: "BOM DIA", mood: "☕" },
  { id: "boa-tarde", label: "Boa tarde", face: "🌤️", accent: "from-orange-100 via-sky-200 to-blue-300", caption: "BOA TARDE", mood: "📚" },
  { id: "boa-noite", label: "Boa noite", face: "🌙", accent: "from-indigo-200 via-blue-300 to-slate-400", caption: "BOA NOITE", mood: "⭐" },
  { id: "aviso", label: "Aviso", face: "📢", accent: "from-amber-100 via-yellow-200 to-orange-300", caption: "AVISO!", mood: "!" },
  { id: "urgente", label: "Urgente", face: "⚡", accent: "from-red-200 via-rose-300 to-pink-400", caption: "URGENTE", mood: "🚨" },
  { id: "atencao", label: "Atenção", face: "⚠️", accent: "from-yellow-100 via-amber-200 to-red-300", caption: "ATENÇÃO", mood: "!" },
  { id: "lembrete", label: "Lembrete", face: "📌", accent: "from-sky-100 via-cyan-200 to-teal-300", caption: "LEMBRETE", mood: "🗓️" },
  { id: "prova", label: "Prova", face: "📄", accent: "from-blue-100 via-slate-200 to-indigo-300", caption: "PROVA", mood: "✍️" },
  { id: "trabalho", label: "Trabalho", face: "💼", accent: "from-stone-100 via-amber-200 to-orange-300", caption: "TRABALHO", mood: "📎" },
  { id: "revisao", label: "Revisão", face: "🔎", accent: "from-purple-100 via-violet-200 to-indigo-300", caption: "REVISÃO", mood: "📖" },
  { id: "plantao", label: "Plantão", face: "🧑‍🏫", accent: "from-emerald-100 via-cyan-200 to-blue-300", caption: "PLANTÃO", mood: "💬" },
  { id: "professor", label: "Professor", face: "👨‍🏫", accent: "from-blue-100 via-indigo-200 to-violet-300", caption: "PROF!", mood: "🍎" },
  { id: "turma-unida", label: "Turma unida", face: "🫶", accent: "from-pink-100 via-fuchsia-200 to-purple-300", caption: "TURMA UNIDA", mood: "🤝" },
  { id: "time", label: "Time", face: "👥", accent: "from-green-100 via-teal-200 to-cyan-300", caption: "TIME", mood: "⭐" },
  { id: "votacao", label: "Votação", face: "🗳️", accent: "from-indigo-100 via-sky-200 to-cyan-300", caption: "VOTAÇÃO", mood: "✅" },
  { id: "ideia", label: "Ideia", face: "💡", accent: "from-yellow-100 via-lime-200 to-green-300", caption: "IDEIA!", mood: "✨" },
  { id: "genial", label: "Genial", face: "🧠", accent: "from-violet-100 via-fuchsia-200 to-pink-300", caption: "GENIAL", mood: "⚡" },
  { id: "criativo", label: "Criativo", face: "🎨", accent: "from-rose-100 via-orange-200 to-yellow-300", caption: "CRIATIVO", mood: "🖌️" },
  { id: "musica", label: "Música", face: "🎧", accent: "from-cyan-100 via-blue-200 to-indigo-300", caption: "PLAY", mood: "🎵" },
  { id: "video", label: "Vídeo", face: "🎬", accent: "from-slate-100 via-zinc-200 to-neutral-300", caption: "VÍDEO", mood: "▶️" },
  { id: "foto", label: "Foto", face: "📸", accent: "from-pink-100 via-orange-200 to-amber-300", caption: "FOTO!", mood: "✨" },
  { id: "chamada", label: "Chamada", face: "📞", accent: "from-emerald-100 via-green-200 to-lime-300", caption: "CHAMADA", mood: "🔔" },
  { id: "online", label: "Online", face: "🟢", accent: "from-green-100 via-emerald-200 to-teal-300", caption: "ONLINE", mood: "💬" },
  { id: "offline", label: "Offline", face: "🌙", accent: "from-slate-200 via-indigo-200 to-blue-300", caption: "JÁ VOLTO", mood: "💤" },
  { id: "lanchinho", label: "Lanchinho", face: "🍪", accent: "from-orange-100 via-amber-200 to-yellow-300", caption: "PAUSA", mood: "☕" },
  { id: "recreio", label: "Recreio", face: "🏃", accent: "from-lime-100 via-green-200 to-cyan-300", caption: "RECREIO", mood: "🎈" },
  { id: "campeao", label: "Campeão", face: "🏆", accent: "from-yellow-100 via-amber-300 to-orange-400", caption: "CAMPEÃO", mood: "⭐" },
  { id: "estrela", label: "Estrela", face: "⭐", accent: "from-amber-100 via-yellow-200 to-lime-300", caption: "BRILHOU", mood: "✨" },
  { id: "coracao", label: "Coração", face: "💙", accent: "from-sky-100 via-blue-200 to-indigo-300", caption: "VALEU", mood: "🫶" },
  { id: "saudades", label: "Saudades", face: "🥹", accent: "from-rose-100 via-pink-200 to-fuchsia-300", caption: "SAUDADES", mood: "💌" },
  { id: "missao", label: "Missão", face: "🧭", accent: "from-teal-100 via-emerald-200 to-lime-300", caption: "MISSÃO", mood: "🚀" },
  { id: "concluido", label: "Concluído", face: "🏁", accent: "from-slate-100 via-green-200 to-emerald-300", caption: "CONCLUÍDO", mood: "✅" },
];

const STICKER_MODES = [
  { prefix: "", suffix: "!" },
  { prefix: "SUPER ", suffix: "" },
  { prefix: "", suffix: " AGORA" },
  { prefix: "", suffix: " TURMA" },
];

const EXTRA_STICKER_FACES = [
  "✨",
  "🌈",
  "💥",
  "💯",
  "🧩",
  "🎲",
  "🪄",
  "🧪",
  "🔬",
  "🧮",
  "📐",
  "📊",
  "🗂️",
  "📋",
  "🖊️",
  "🖍️",
  "🧑‍🎓",
  "👩‍🎓",
  "👨‍🎓",
  "🧑‍🏫",
  "👩‍🏫",
  "👨‍🏫",
  "🗣️",
  "💬",
  "🔔",
  "📣",
  "🎙️",
  "🎤",
  "🎼",
  "🎹",
  "🥁",
  "🎸",
  "📷",
  "🖼️",
  "🎭",
  "🎪",
  "🏫",
  "🚌",
  "🎒",
  "🧢",
  "👟",
  "🍎",
  "🍫",
  "🥤",
  "🍿",
  "🧁",
  "🎁",
  "🎀",
  "🪩",
  "🕺",
  "💃",
  "🙈",
  "🙉",
  "🙊",
  "🤯",
  "😱",
  "🥶",
  "🥵",
  "🤓",
  "🧐",
  "😜",
  "😋",
  "🤗",
  "😬",
  "😮‍💨",
  "🫡",
  "🤲",
  "🫰",
  "🙆",
  "🙅",
  "🏃‍♀️",
  "🏃‍♂️",
  "🧘",
  "🏅",
  "🥇",
  "🥈",
  "🥉",
  "🎖️",
  "🛎️",
  "⏳",
  "⌛",
  "🧭",
  "🗺️",
  "🧱",
  "🛠️",
  "🔐",
  "🔑",
  "🧯",
  "🟣",
  "🔵",
  "🟢",
  "🟡",
  "🟠",
  "🔴",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
];

const STICKERS: StickerItem[] = Array.from({ length: 200 }, (_, index) => {
  const seed = STICKER_SEEDS[index % STICKER_SEEDS.length];
  const mode = STICKER_MODES[Math.floor(index / STICKER_SEEDS.length)];
  const face = index < STICKER_SEEDS.length
    ? seed.face
    : EXTRA_STICKER_FACES[(index - STICKER_SEEDS.length) % EXTRA_STICKER_FACES.length];
  const caption = `${mode.prefix}${seed.caption}${mode.suffix}`;

  return {
    ...seed,
    id: `${seed.id}-${index + 1}`,
    label: caption,
    caption,
    face,
    mood: "",
    frame: "cutout",
  };
});

const SOUND_EFFECTS: SoundEffectItem[] = [
  { id: "eita", label: "Eitaaa", phrase: "Eitaaa!", icon: "⚡", accent: "from-orange-100 to-red-200" },
  { id: "uhuu", label: "Uhuu", phrase: "Uhuu!", icon: "🎉", accent: "from-pink-100 to-fuchsia-200" },
  { id: "atencao", label: "Atenção", phrase: "Atenção!", icon: "📢", accent: "from-amber-100 to-yellow-200" },
  { id: "arrasou", label: "Arrasou", phrase: "Arrasou!", icon: "🌟", accent: "from-yellow-100 to-orange-200" },
  { id: "bora", label: "Bora", phrase: "Bora, turma!", icon: "💪", accent: "from-lime-100 to-green-200" },
  { id: "vish", label: "Vish", phrase: "Vish!", icon: "😅", accent: "from-sky-100 to-blue-200" },
  { id: "parabens", label: "Parabéns", phrase: "Parabéns!", icon: "🏆", accent: "from-emerald-100 to-teal-200" },
  { id: "risada", label: "Risada", phrase: "Ha ha ha!", icon: "😂", accent: "from-yellow-100 to-amber-200" },
  { id: "silencio", label: "Silêncio", phrase: "Silêncio, por favor!", icon: "🤫", accent: "from-slate-100 to-zinc-200" },
  { id: "chamando", label: "Chamando", phrase: "Estou chamando!", icon: "📞", accent: "from-green-100 to-emerald-200" },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function canBroadcastToSchool(role?: UserRole) {
  return (
    role === "ADMIN_ESCOLA" ||
    role === "GESTOR" ||
    role === "SECRETARIA"
  );
}

function isStickerMessage(texto: string) {
  return texto.startsWith("::sticker:") && texto.endsWith("::");
}

function getStickerId(texto: string) {
  return texto.replace("::sticker:", "").replace("::", "");
}

function isCallMessage(texto: string) {
  return texto.startsWith("::call:");
}

function getCallMode(texto: string): "voz" | "video" {
  return texto.includes(":video::") ? "video" : "voz";
}

function isSoundMessage(texto: string) {
  return texto.startsWith("::sound:") && texto.endsWith("::");
}

function getSoundId(texto: string) {
  return texto.replace("::sound:", "").replace("::", "");
}

function isEmojiOnlyMessage(texto: string) {
  const trimmed = texto.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 18 &&
    /^[\p{Emoji}\uFE0F\u200D\s]+$/u.test(trimmed)
  );
}

export default function ChatPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const ringtoneRef = useRef<{
    context: AudioContext;
    oscillators: OscillatorNode[];
    gain: GainNode;
    interval: number;
    timeout: number;
  } | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupoId, setGrupoId] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [paraTodosEscola, setParaTodosEscola] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "stickers" | "gifs" | "specials">("emoji");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("gestclass_chat_sound") !== "false";
  });
  const [ringing, setRinging] = useState(false);
  const [callStream, setCallStream] = useState<MediaStream | null>(null);
  const [callMode, setCallMode] = useState<"voz" | "video" | "">("");
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [communicationBackgroundId, setCommunicationBackgroundId] =
    useState("black");
  const [seenMessageCounts, setSeenMessageCounts] = useState<Record<string, number>>(
    {},
  );
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const grupoAtual = useMemo(
    () => grupos.find((grupo) => grupo.id === grupoId) || null,
    [grupos, grupoId],
  );
  const communicationTheme = useMemo(
    () =>
      communicationBackgroundOptions.find(
        (option) => option.id === communicationBackgroundId,
      ) || communicationBackgroundOptions[0],
    [communicationBackgroundId],
  );
  const isGestao =
    user?.role === "ADMIN_ESCOLA" ||
    user?.role === "GESTOR" ||
    user?.role === "COORDENADOR" ||
    user?.role === "SECRETARIA";
  const conversaSomenteLeitura =
    Boolean(grupoAtual?.tipo === "PERSONALIZADO" && isGestao) &&
    !Boolean(grupoAtual?.membros?.some((membro) => membro.user.id === user?.id));
  const currentUserId = user?.id || "";
  const gruposFiltrados = useMemo(() => {
    const termo = chatSearch.trim().toLowerCase();
    if (!termo) return grupos;

    return grupos.filter((grupo) => {
      const nomeGrupo = String(grupo.nome || "").toLowerCase();
      const nomeTurma = String(grupo.turma?.name || "").toLowerCase();
      const algumMembro = (grupo.membros || []).some((membro) =>
        String(membro.user.name || "").toLowerCase().includes(termo),
      );

      return (
        nomeGrupo.includes(termo) ||
        nomeTurma.includes(termo) ||
        algumMembro
      );
    });
  }, [grupos, chatSearch]);
  const mobileConversationOpen = Boolean(grupoId);

  function persistSeenMessageCounts(
    updater: Record<string, number> | ((current: Record<string, number>) => Record<string, number>),
  ) {
    setSeenMessageCounts((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;

      try {
        localStorage.setItem(unreadMessagesKey(user?.id), JSON.stringify(next));
      } catch {}

      return next;
    });
  }

  function markGrupoAsSeen(targetGroupId: string, totalMensagens?: number) {
    if (!targetGroupId) return;

    const grupo = grupos.find((item) => item.id === targetGroupId);
    const totalAtual = Number(grupo?.totalMensagens || 0);

    persistSeenMessageCounts((current) => ({
      ...current,
      [targetGroupId]: Math.max(Number(current[targetGroupId] || 0), totalAtual),
    }));
  }

  function getUnreadCount(grupo: Grupo) {
    if (grupo.id === grupoId) return 0;

    const totalMensagens = Number(grupo.totalMensagens || grupo._count?.mensagens || 0);
    const seen = Number(seenMessageCounts[grupo.id] || 0);

    return Math.max(totalMensagens - seen, 0);
  }

  function scrollMessagesToBottom() {
    const scroll = () => {
      const container = messagesContainerRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    };

    scroll();
    window.requestAnimationFrame(scroll);
    window.setTimeout(scroll, 80);
  }

  async function fetchGrupos() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");
      const res = await fetch(apiUrl("/comunicacao/grupos"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao carregar grupos.");

      const lista = Array.isArray(data) ? data : [];
      setGrupos(lista);
      const requestedGroupId = searchParams.get("grupoId");
      setGrupoId((current) => {
        if (requestedGroupId && lista.some((grupo) => grupo.id === requestedGroupId)) {
          return requestedGroupId;
        }

        if (current && lista.some((grupo) => grupo.id === current)) {
          return current;
        }

        const grupoColaboradores = lista.find(
          (grupo) => grupo.nome === COLABORADORES_GROUP_NAME,
        );

        if (user?.role === "PROFESSOR" && grupoColaboradores) {
          return grupoColaboradores.id;
        }

        return lista[0]?.id || "";
      });
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao carregar grupos."));
    } finally {
      setLoading(false);
    }
  }

  async function fetchMensagens(id: string) {
    if (!token || !id) return;

    try {
      const res = await fetch(apiUrl(`/comunicacao/chat?grupoId=${id}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Erro ao carregar chat.");
      const lista = Array.isArray(data) ? data : [];
      setMensagens((atuais) => {
        const novaMensagem = lista.length > atuais.length ? lista[lista.length - 1] : null;
        const authorId = novaMensagem?.author?.id;
        const isFromOtherUser = Boolean(authorId && authorId !== user?.id);

        if (isFromOtherUser && soundEnabled) {
          if (isCallMessage(novaMensagem.texto || "")) {
            playRingtone();
          } else if (isSoundMessage(novaMensagem.texto || "")) {
            playSoundEffect(getSoundId(novaMensagem.texto || ""));
          } else {
            playMessageSound();
          }
        }

        return lista;
      });
    } catch (err) {
      setError(getErrorMessage(err, "Erro ao carregar chat."));
    }
  }

  useEffect(() => {
    fetchGrupos();
  }, [token, searchParams, user?.role]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(unreadMessagesKey(user?.id));
      setSeenMessageCounts(stored ? JSON.parse(stored) : {});
    } catch {
      setSeenMessageCounts({});
    }
  }, [user?.id]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(communicationBackgroundKey(user?.id));
      if (
        stored &&
        communicationBackgroundOptions.some((option) => option.id === stored)
      ) {
        setCommunicationBackgroundId(stored);
      }
    } catch {
      setCommunicationBackgroundId("black");
    }
  }, [user?.id]);

  useEffect(() => {
    fetchMensagens(grupoId);
    const interval = window.setInterval(() => fetchMensagens(grupoId), 12000);
    return () => window.clearInterval(interval);
  }, [token, grupoId, soundEnabled, user?.id]);

  useEffect(() => {
    if (!grupoId) return;

    const grupo = grupos.find((item) => item.id === grupoId);
    if (!grupo) return;

    markGrupoAsSeen(grupoId, Number(grupo.totalMensagens || grupo._count?.mensagens || 0));
  }, [grupoId, grupos]);

  useEffect(() => {
    scrollMessagesToBottom();
  }, [mensagens.length, grupoId]);

  useEffect(() => {
    if (!grupoId || !mensagens.length) return;

    persistSeenMessageCounts((current) => ({
      ...current,
      [grupoId]: Math.max(Number(current[grupoId] || 0), mensagens.length),
    }));
  }, [grupoId, mensagens.length]);

  useEffect(() => {
    async function markChatSeen() {
      if (!token) return;
      try {
        const response = await fetch(apiUrl("/comunicacao/resumo"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok) {
          localStorage.setItem("gestclass_chat_seen", String(data?.chat || 0));
          localStorage.setItem("gestclass_comunicacao_seen", String(data?.total || 0));
        }
      } catch {}
    }
    markChatSeen();
  }, [token, mensagens.length]);

  useEffect(() => {
    if (videoRef.current && callStream) {
      videoRef.current.srcObject = callStream;
    }
  }, [callStream]);

  useEffect(() => {
    let interval: number | undefined;
    if (recording) {
      interval = window.setInterval(() => setRecordingTime((current) => current + 1), 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      stopRingtone();
      callStream?.getTracks().forEach((track) => track.stop());
    };
  }, [callStream]);

  function escolherFundoComunicacao(backgroundId: string) {
    setCommunicationBackgroundId(backgroundId);

    try {
      localStorage.setItem(communicationBackgroundKey(user?.id), backgroundId);
    } catch {}
  }

  function mediaSrc(url?: string | null) {
    if (!url) return "";
    return url.startsWith("http") ? url : `${API_URL}${url}`;
  }

  function Avatar({ pessoa, size = "md" }: { pessoa: Pessoa; size?: "sm" | "md" }) {
    const dimension = size === "sm" ? "h-16 w-16" : "h-14 w-14";
    const innerDimension = size === "sm" ? "h-14 w-14" : "h-12 w-12";
    const src = mediaSrc(pessoa.fotoUrl);
    return (
      <div
        className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-violet-600 p-[3px]`}
      >
        {src ? (
          <img
            src={src}
            alt={pessoa.name}
            className={`${innerDimension} rounded-full border-2 border-white object-cover`}
          />
        ) : (
          <div
            className={`${innerDimension} flex items-center justify-center rounded-full border-2 border-white bg-slate-900 text-xs font-bold text-white`}
          >
            {pessoa.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
    );
  }

  function StickerPreview({ sticker, compact = false }: { sticker: StickerItem; compact?: boolean }) {
    const stickerSize = compact
      ? "h-24 w-24"
      : "h-36 w-36 sm:h-40 sm:w-48";
    const emojiSize = compact ? "text-4xl" : "text-6xl sm:text-7xl";
    const captionSize = compact ? "text-[9px]" : "text-xs sm:text-sm";

    return (
      <div
        className={`relative inline-flex flex-col items-center justify-center overflow-visible ${stickerSize}`}
      >
        <span
          className={`${emojiSize} animate-bounce drop-shadow-[0_8px_12px_rgba(15,23,42,0.25)]`}
          style={{
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          }}
        >
          {sticker.face}
        </span>
        <span
          className={`mt-1 max-w-[96%] text-center font-black uppercase leading-none tracking-wide text-slate-900 drop-shadow-[0_2px_0_rgba(255,255,255,0.95)] ${captionSize}`}
        >
          {sticker.caption}
        </span>
        <span className={`${compact ? "hidden" : "mt-1 text-[10px] font-bold text-slate-600"}`}>
          {sticker.label}
        </span>
      </div>
    );
  }

  function EmojiPreview({ value }: { value: string }) {
    return (
      <div className="inline-flex h-36 w-36 items-center justify-center sm:h-40 sm:w-48">
        <span
          className="text-6xl leading-none drop-shadow-md sm:text-7xl"
          style={{
            fontFamily:
              '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          }}
        >
          {value}
        </span>
      </div>
    );
  }

  function appendToken(value: string) {
    setTexto((current) => `${current}${value}`);
  }

  function openAttachPicker(type: "media" | "audio") {
    setShowAttachMenu(false);
    if (type === "audio") {
      audioInputRef.current?.click();
      return;
    }
    mediaInputRef.current?.click();
  }

  function playMessageSound() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 960;
      gain.gain.value = 0.05;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      window.setTimeout(() => {
        oscillator.frequency.value = 1240;
      }, 80);
      window.setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 180);
    } catch {}
  }

  function playSoundEffect(soundId: string) {
    const effect = SOUND_EFFECTS.find((item) => item.id === soundId) || SOUND_EFFECTS[0];

    try {
      const utterance = new SpeechSynthesisUtterance(effect.phrase);
      utterance.lang = "pt-BR";
      utterance.rate = effect.id === "eita" ? 0.82 : 0.95;
      utterance.pitch = effect.id === "eita" ? 1.35 : 1.15;
      utterance.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {}

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const gain = audioContext.createGain();
      gain.gain.value = 0.08;
      gain.connect(audioContext.destination);

      [520, 680, 860].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = index === 0 ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(audioContext.currentTime + index * 0.08);
        oscillator.stop(audioContext.currentTime + 0.16 + index * 0.08);
      });

      window.setTimeout(() => audioContext.close(), 600);
    } catch {}
  }

  function playRingtone(force = false) {
    if ((!soundEnabled && !force) || ringtoneRef.current) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const context = new AudioContextClass();
      const gain = context.createGain();
      void context.resume?.();
      gain.gain.value = 0.001;
      gain.connect(context.destination);

      const oscillators = [415, 523].map((frequency) => {
        const oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });

      const pulse = () => {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.62);
        oscillators[0].frequency.setValueAtTime(415, now);
        oscillators[1].frequency.setValueAtTime(523, now);
        oscillators[0].frequency.setValueAtTime(466, now + 0.24);
        oscillators[1].frequency.setValueAtTime(587, now + 0.24);
      };

      pulse();
      const interval = window.setInterval(pulse, 1050);
      const timeout = window.setTimeout(stopRingtone, 18000);
      ringtoneRef.current = { context, oscillators, gain, interval, timeout };
      setRinging(true);
    } catch {
      setRinging(false);
    }
  }

  function stopRingtone() {
    const ringtone = ringtoneRef.current;
    if (!ringtone) return;

    window.clearInterval(ringtone.interval);
    window.clearTimeout(ringtone.timeout);
    ringtone.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {}
    });
    ringtone.context.close();
    ringtoneRef.current = null;
    setRinging(false);
  }

  async function abrirChatPrivado(targetUserId: string) {
    if (!token) return;
    const res = await fetch(apiUrl("/comunicacao/chat/privado"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || "Erro ao abrir chat privado.");
      return;
    }
    await fetchGrupos();
    setGrupoId(data.id);
  }

  async function sendTextMessage(messageText: string) {
    if (
      !token ||
      conversaSomenteLeitura ||
      !messageText.trim() ||
      (!grupoId && !paraTodosEscola)
    ) {
      return;
    }

    const formData = new FormData();
    formData.append("grupoId", paraTodosEscola ? "" : grupoId);
    formData.append("texto", messageText);
    formData.append("paraTodosEscola", String(paraTodosEscola));

    const res = await fetch(apiUrl("/comunicacao/chat"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || "Erro ao enviar mensagem.");
      return;
    }

    setParaTodosEscola(false);
    if (data?.grupoId) {
      await fetchGrupos();
      setGrupoId(data.grupoId);
      await fetchMensagens(data.grupoId);
    } else {
      await fetchMensagens(grupoId);
    }
    scrollMessagesToBottom();
  }

  async function sendSticker(stickerId: string) {
    setShowPicker(false);
    await sendTextMessage(`::sticker:${stickerId}::`);
  }

  async function sendGifSticker(stickerId: string) {
    setShowPicker(false);
    await sendTextMessage(`::sticker:${stickerId}::`);
  }

  async function sendSoundEffect(soundId: string) {
    setShowPicker(false);
    playSoundEffect(soundId);
    await sendTextMessage(`::sound:${soundId}::`);
  }

  async function startCall(mode: "voz" | "video", announce = true) {
    try {
      stopRingtone();
      playRingtone(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === "video",
      });
      setCallStream(stream);
      setCallMode(mode);
      if (announce) {
        await sendTextMessage(`::call:${mode}::`);
      }
    } catch {
      stopRingtone();
      setError("Não foi possível acessar microfone/câmera neste navegador.");
    }
  }

  function stopCall() {
    stopRingtone();
    callStream?.getTracks().forEach((track) => track.stop());
    setCallStream(null);
    setCallMode("");
  }

  async function startRecording() {
    if ((!grupoId && !paraTodosEscola) || recording || conversaSomenteLeitura) return;

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioChunksRef.current = [];
        setRecording(false);
        setRecordingTime(0);

        if (!blob.size) return;

        const audioFile = new File([blob], `audio-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        await sendFileMessage(audioFile, "Mensagem de voz");
      };

      recorder.start();
      setRecording(true);
      setRecordingTime(0);
    } catch {
      setError("Não foi possível acessar o microfone para gravar áudio.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("gestclass_chat_sound", String(next));
    if (!next) stopRingtone();
  }

  async function sendFileMessage(selectedFile: File, messageText = texto) {
    if (!token || conversaSomenteLeitura || (!grupoId && !paraTodosEscola)) return;

    const formData = new FormData();
    formData.append("grupoId", paraTodosEscola ? "" : grupoId);
    formData.append("texto", messageText);
    formData.append("paraTodosEscola", String(paraTodosEscola));
    formData.append("file", selectedFile);

    const res = await fetch(apiUrl("/comunicacao/chat"), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message || "Erro ao enviar mensagem.");
      return;
    }

    setTexto("");
    setFile(null);
    setParaTodosEscola(false);
    if (data?.grupoId) {
      await fetchGrupos();
      setGrupoId(data.grupoId);
      await fetchMensagens(data.grupoId);
    } else {
      await fetchMensagens(grupoId);
    }
    scrollMessagesToBottom();
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (
      !token ||
      conversaSomenteLeitura ||
      (!grupoId && !paraTodosEscola) ||
      (!texto.trim() && !file)
    ) {
      return;
    }

    if (file) {
      await sendFileMessage(file);
      return;
    }

    await sendTextMessage(texto);
    setTexto("");
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function renderMessageContent(mensagem: Mensagem) {
    if (isStickerMessage(mensagem.texto || "")) {
      const sticker = STICKERS.find((item) => item.id === getStickerId(mensagem.texto)) || STICKERS[0];
      return <StickerPreview sticker={sticker} />;
    }

    if (isSoundMessage(mensagem.texto || "")) {
      const effect = SOUND_EFFECTS.find((item) => item.id === getSoundId(mensagem.texto)) || SOUND_EFFECTS[0];

      return (
        <button
          type="button"
          onClick={() => playSoundEffect(effect.id)}
          className={`inline-flex h-36 w-36 flex-col items-center justify-center rounded-3xl bg-gradient-to-br ${effect.accent} p-4 text-center text-slate-900 shadow-lg ring-1 ring-slate-900/5 sm:h-40 sm:w-48`}
        >
          <span className="text-5xl drop-shadow-sm">{effect.icon}</span>
          <span className="mt-3 rounded-full bg-white/80 px-3 py-1 text-xs font-black uppercase">
            {effect.label}
          </span>
          <span className="mt-2 text-[10px] font-bold text-slate-600">
            tocar efeito
          </span>
        </button>
      );
    }

    if (isCallMessage(mensagem.texto || "")) {
      const mode = getCallMode(mensagem.texto);
      return (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-slate-800">
          <div className="flex items-center gap-2">
            {mode === "video" ? <Video size={18} /> : <Phone size={18} />}
            <p className="text-sm font-bold">
              {mode === "video" ? "Chamada de vídeo" : "Chamada de voz"}
            </p>
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            {mensagem.author.id === user?.id ? "Você iniciou uma chamada." : "Chamada recebida. Toque para atender."}
          </p>
          {mensagem.author.id !== user?.id ? (
            <button
              type="button"
              onClick={() => startCall(mode, false)}
              className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
            >
              Atender
            </button>
          ) : null}
        </div>
      );
    }

    if (isEmojiOnlyMessage(mensagem.texto || "")) {
      return <EmojiPreview value={mensagem.texto.trim()} />;
    }

    return mensagem.texto ? (
      <p className="whitespace-pre-wrap text-sm leading-6">{mensagem.texto}</p>
    ) : null;
  }

  function formatMessageTime(value: string) {
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

function getConversationSubtitle(grupo: Grupo) {
    const origem =
      grupo.turma?.name ||
      (grupo.nome === COLABORADORES_GROUP_NAME
        ? "Rede dos professores"
        : grupo.tipo === "PERSONALIZADO"
          ? "Conversa personalizada"
          : `${grupo.membros.length} integrante(s)`);
    const totalMensagens =
      Number(grupo.totalMensagens || grupo._count?.mensagens || 0);

    return `${origem} • ${totalMensagens} mensagem(ns)`;
  }

  return (
    <section className="-m-0 flex h-screen w-screen flex-col overflow-hidden bg-[#0b141a]">
      {error ? (
          <div className="mx-4 mt-4 rounded-xl border border-red-500/30 bg-red-950/60 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}
        {conversaSomenteLeitura ? (
          <div className="mx-4 mt-4 rounded-xl border border-amber-400/30 bg-amber-950/60 px-4 py-3 text-sm font-medium text-amber-100">
            {"Visualiza\u00e7\u00e3o segura: a gest\u00e3o pode acompanhar esta conversa privada, mas n\u00e3o pode escrever nela."}
          </div>
        ) : null}

      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className={`${mobileConversationOpen ? "hidden xl:flex" : "flex"} min-h-0 flex-col overflow-hidden border-r border-[#d1d7db] bg-[#f0f2f5]`}
        >
          <div className="shrink-0 border-b border-[#d1d7db] p-5">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Dashboard
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-black/5"
                title="Mais opções"
              >
                <MoreVertical size={18} />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-full bg-white px-4 py-3 shadow-sm">
              <Search size={18} className="text-slate-400" />
              <input
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#d9fdd3] px-4 py-2 text-sm font-semibold text-[#0a6b4a]">
                Tudo
              </span>
              <span className="rounded-full border border-[#d1d7db] bg-white px-4 py-2 text-sm font-medium text-slate-600">
                {loading ? "Carregando..." : `${grupos.length} conversa(s)`}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-[#eef1f3] overflow-y-auto bg-white">
            {gruposFiltrados.map((grupo) => (
              <button
                key={grupo.id}
                type="button"
                onClick={() => {
                  setGrupoId(grupo.id);
                  markGrupoAsSeen(
                    grupo.id,
                    Number(grupo.totalMensagens || grupo._count?.mensagens || 0),
                  );
                }}
                className={`w-full px-5 py-4 text-left transition hover:bg-[#f5f6f6] ${
                  grupo.id === grupoId ? "bg-[#f0f2f5]" : "bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate font-semibold text-slate-900">{grupo.nome}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    {getUnreadCount(grupo) > 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        {getUnreadCount(grupo)}
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-500">
                      {grupo.id === grupoId && mensagens.length
                        ? formatMessageTime(mensagens[mensagens.length - 1].createdAt)
                        : ""}
                    </span>
                  </div>
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {getConversationSubtitle(grupo)}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div
          className={`${mobileConversationOpen ? "flex" : "hidden xl:flex"} min-h-0 flex-col overflow-hidden bg-[#efeae2]`}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-[#d1d7db] bg-[#f0f2f5] px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGrupoId("")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm xl:hidden"
                  aria-label="Voltar para conversas"
                >
                  <ArrowLeft size={17} />
                </button>
                <h2 className="truncate text-lg font-bold text-slate-900">
                  {grupoAtual?.nome || "Selecione uma conversa"}
                </h2>
              </div>
              <p className="mt-1 truncate text-xs font-medium text-slate-500">
                {grupoAtual?.turma?.name || "Comunicação interna"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => startCall("voz")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-black/5"
                title="Conversa de voz"
              >
                <Phone size={17} />
              </button>
              <button
                type="button"
                onClick={() => startCall("video")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-black/5"
                title="Video conversa"
              >
                <Video size={17} />
              </button>
              <button
                type="button"
                onClick={toggleSound}
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  soundEnabled ? "bg-white text-cyan-700 shadow-sm" : "text-slate-700 hover:bg-black/5"
                }`}
                title={soundEnabled ? "Desativar sons" : "Ativar sons"}
              >
                {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="hidden xl:inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Dashboard
              </button>
            </div>
          </div>

          <div className="shrink-0 border-b border-[#d1d7db] bg-[#f0f2f5] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-bold text-slate-700">
                Fundo
              </span>
              {communicationBackgroundOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => escolherFundoComunicacao(option.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    communicationBackgroundId === option.id
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: option.color }}
                  />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {callStream ? (
            <div className="shrink-0 border-b border-emerald-100 bg-emerald-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    {callMode === "video" ? "Chamada de vídeo ativa" : "Chamada de voz ativa"}
                  </p>
              <p className="text-xs text-emerald-600">
                    {ringing
                      ? "Toque de chamada ativo. Use Encerrar para parar microfone/câmera."
                      : "Microfone/câmera ativos nesta chamada."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {ringing ? (
                    <button
                      type="button"
                      onClick={stopRingtone}
                      className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700"
                    >
                      Parar toque
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={stopCall}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Encerrar
                  </button>
                </div>
              </div>
              {callMode === "video" ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="mt-3 max-h-64 w-full rounded-xl bg-black object-contain"
                />
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSend} className="order-2 shrink-0 border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-3 sm:px-4">
            {showPicker ? (
              <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex gap-2">
                  {[
                    ["emoji", "Emojis"],
                    ["stickers", "Figurinhas"],
                    ["gifs", "GIFs"],
                    ["specials", "Símbolos"],
                  ].map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPickerTab(tab as typeof pickerTab)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold ${
                        pickerTab === tab ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {pickerTab === "emoji" ? (
                  <div className="max-h-52 space-y-3 overflow-y-auto">
                    {EMOJI_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="mb-1 text-xs font-bold uppercase text-slate-400">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                          {group.items.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => appendToken(item)}
                              className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-50 text-5xl leading-none shadow-sm transition hover:scale-105 hover:bg-slate-100"
                              style={{
                                fontFamily:
                                  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
                              }}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pickerTab === "stickers" ? (
                  <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-6">
                    {STICKERS.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        onClick={() => sendSticker(sticker.id)}
                        className="rounded-2xl p-1 hover:bg-slate-100"
                      >
                        <StickerPreview sticker={sticker} compact />
                      </button>
                    ))}
                  </div>
                ) : null}

                {pickerTab === "gifs" ? (
                  <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
                    {STICKERS.slice(0, 24).map((sticker) => (
                      <button
                        key={`gif-${sticker.id}`}
                        type="button"
                        onClick={() => sendGifSticker(sticker.id)}
                        className="rounded-2xl bg-slate-50 p-2 text-center shadow-sm transition hover:scale-105 hover:bg-slate-100"
                      >
                        <StickerPreview sticker={sticker} compact />
                      </button>
                    ))}
                  </div>
                ) : null}

                {pickerTab === "specials" ? (
                  <div className="flex flex-wrap gap-2">
                    {SPECIALS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => appendToken(item)}
                        className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-slate-100 px-3 text-lg font-bold text-slate-700 hover:bg-slate-200"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {file ? (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                <span>
                  Anexo selecionado: <strong>{file.name}</strong>
                </span>
                <button type="button" onClick={() => setFile(null)} title="Remover anexo">
                  <X size={16} />
                </button>
              </div>
            ) : null}

            {recording ? (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">
                  Gravando áudio... {String(Math.floor(recordingTime / 60)).padStart(2, "0")}:
                  {String(recordingTime % 60).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"
                >
                  <Square size={13} />
                  Enviar áudio
                </button>
              </div>
            ) : null}

            <div className="relative flex flex-wrap items-end gap-2">
              {canBroadcastToSchool(user?.role) ? (
                <button
                  type="button"
                  onClick={() => setParaTodosEscola((current) => !current)}
                  disabled={conversaSomenteLeitura}
                  className={`order-2 inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-bold disabled:opacity-50 ${
                    paraTodosEscola
                      ? "bg-emerald-500 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Enviar esta mensagem para todos da escola"
                >
                  <Send size={16} />
                  Todos da escola
                </button>
              ) : null}
              <div className="order-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu((current) => !current);
                    setShowPicker(false);
                  }}
                  disabled={conversaSomenteLeitura}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  title="Anexar"
                >
                  <Plus size={20} />
                </button>
                {showAttachMenu ? (
                  <div className="absolute bottom-16 left-0 z-20 min-w-[190px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <button
                      type="button"
                      onClick={() => openAttachPicker("media")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <ImagePlus size={18} />
                      Foto ou vídeo
                    </button>
                    <button
                      type="button"
                      onClick={() => openAttachPicker("audio")}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Music size={18} />
                      Áudio
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPicker((current) => !current);
                  setShowAttachMenu(false);
                }}
                disabled={conversaSomenteLeitura}
                className="order-2 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                title="Emojis, GIFs e figurinhas"
              >
                <Smile size={18} />
              </button>
              <label
                className="hidden"
                title="Imagem, vídeo ou música"
              >
                <ImagePlus size={18} />
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  disabled={conversaSomenteLeitura}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <label
                className="hidden"
                title="Enviar música/áudio"
              >
                <Music size={18} />
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  disabled={conversaSomenteLeitura}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={conversaSomenteLeitura}
                className="hidden"
                title={recording ? "Parar e enviar áudio" : "Gravar mensagem de voz"}
              >
                {recording ? <Square size={18} /> : <Mic size={18} />}
              </button>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Digite uma mensagem"
                disabled={conversaSomenteLeitura}
                rows={1}
                className="order-1 max-h-28 min-h-[3.5rem] basis-full resize-none overflow-y-auto rounded-[1.8rem] border border-transparent bg-white px-5 pb-2 pt-5 text-base leading-6 text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60"
              />
              {texto.trim() || file ? (
                <button
                  type="submit"
                  disabled={
                    (!grupoId && !paraTodosEscola) ||
                    conversaSomenteLeitura ||
                    (!texto.trim() && !file)
                  }
                  className="order-2 ml-auto inline-flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-[#00a884] text-sm font-bold text-white hover:bg-[#019270] disabled:cursor-not-allowed disabled:opacity-60"
                  title="Enviar"
                >
                  <Send size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={conversaSomenteLeitura}
                  className={`order-2 ml-auto flex h-12 w-12 items-center justify-center rounded-full ${
                    recording
                      ? "bg-red-50 text-red-700"
                      : "bg-white text-slate-700 shadow-sm hover:bg-slate-50"
                  }`}
                  title={recording ? "Parar e enviar áudio" : "Gravar mensagem de voz"}
                >
                  {recording ? <Square size={18} /> : <Mic size={20} />}
                </button>
              )}
            </div>
          </form>

          <div
            ref={messagesContainerRef}
            className="order-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-8"
            style={{
              backgroundColor: "#efeae2",
              backgroundImage:
                "radial-gradient(circle at 25px 25px, rgba(189,173,153,0.12) 2px, transparent 0), radial-gradient(circle at 75px 75px, rgba(189,173,153,0.1) 2px, transparent 0)",
              backgroundSize: "100px 100px",
            }}
          >
            {mensagens.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Nenhuma mensagem ainda.
              </div>
            ) : (
              mensagens.map((mensagem) => {
                const isMine = Boolean(currentUserId && mensagem.author.id === currentUserId);
                const isFloatingMessage =
                  isStickerMessage(mensagem.texto || "") ||
                  isEmojiOnlyMessage(mensagem.texto || "");

                return (
                  <div
                    key={mensagem.id}
                    className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex max-w-[78%] flex-col ${
                        isMine ? "items-end text-right" : "items-start text-left"
                      } ${
                        isFloatingMessage
                          ? `bg-transparent p-0 ${communicationTheme.floatingTextClass} shadow-none`
                          : `rounded-2xl px-4 py-3 ${
                              isMine
                                ? "rounded-br-md bg-[#d9fdd3] text-slate-900 shadow-sm"
                                : "rounded-bl-md bg-white text-slate-900 shadow-sm"
                            }`
                      }`}
                    >
                      {!isMine ? (
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar pessoa={mensagem.author} size="sm" />
                          <p className="text-xs font-semibold text-slate-500">
                            {mensagem.author.name}
                          </p>
                        </div>
                      ) : null}
                      {renderMessageContent(mensagem)}
                      {mensagem.mediaUrl ? (
                        mensagem.mediaMime?.startsWith("image/") ? (
                          <img
                            src={mediaSrc(mensagem.mediaUrl)}
                            alt="Imagem enviada"
                            className="mt-2 max-h-72 rounded-xl object-contain"
                          />
                        ) : mensagem.mediaMime?.startsWith("video/") ? (
                          <video
                            src={mediaSrc(mensagem.mediaUrl)}
                            controls
                            className="mt-2 max-h-72 rounded-xl bg-black"
                          />
                        ) : (
                          <VoiceMessagePlayer
                            src={mediaSrc(mensagem.mediaUrl)}
                            isMine={isMine}
                            timeLabel={formatMessageTime(mensagem.createdAt)}
                          />
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>


        </div>

        <aside className="hidden min-h-0 flex-col overflow-hidden border-l xl:hidden">
          <div className={`shrink-0 border-b p-5 ${communicationTheme.chatHeaderClass}`}>
            <p className="text-sm font-bold">Integrantes</p>
            <p className="mt-1 text-xs opacity-70">
              Clique para conversar no privado ou mencionar no grupo.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {(grupoAtual?.membros || []).map((membro) => (
              <div key={membro.user.id} className="rounded-2xl p-3 hover:bg-white/40">
                <div className="flex items-center gap-3">
                  <Avatar pessoa={membro.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold">
                      {membro.user.name}
                    </p>
                    <p className="text-xs font-medium opacity-70">{membro.user.role}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => abrirChatPrivado(membro.user.id)}
                    disabled={membro.user.id === user?.id}
                    className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"
                  >
                    Privado
                  </button>
                  <button
                    type="button"
                    onClick={() => appendToken(`@${membro.user.name} `)}
                    className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    Mencionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
