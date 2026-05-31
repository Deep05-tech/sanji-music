import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Home,
  Heart,
  ChevronLeft,
  ChevronRight,
  User,
  Maximize2,
  Mic2,
  ListMusic,
  Utensils,
  Flame,
  Library,
  Plus,
  Shuffle,
  Repeat2,
  ChefHat,
  ChevronDown,
} from 'lucide-react';
import './index.css';

const DEV_PORTS = new Set(['3000', '3001', '3002', '3003', '5173']);
const IS_DEV_CLIENT = ['localhost', '127.0.0.1'].includes(window.location.hostname) && DEV_PORTS.has(window.location.port);
const DEFAULT_API_URL = import.meta.env.VITE_SANJI_API_URL || (IS_DEV_CLIENT ? 'http://localhost:5000' : window.location.origin);
const API_STORAGE_KEY = 'sanji_api_url';
const AUTH_TOKEN_KEY = 'sanji_auth_token';
const AUTH_USER_KEY = 'sanji_auth_user';

const STORAGE_KEY = 'sanji_recent';
const LEGACY_STORAGE_KEY = 'santoryu_recent';
const LIKED_STORAGE_KEY = 'sanji_liked_songs';
const PLAYLIST_STORAGE_KEY = 'sanji_playlists';
const SEARCH_CACHE_KEY = 'sanji_search_cache';
const SEARCH_CACHE_TTL = 15 * 60 * 1000;

function getSearchCache(query) {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const entry = cache[query.toLowerCase().trim()];
    if (!entry) return null;
    if (Date.now() - entry.ts > SEARCH_CACHE_TTL) {
      delete cache[query.toLowerCase().trim()];
      localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.results;
  } catch { return null; }
}

function setSearchCache(query, results) {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_KEY) || '{}';
    const cache = JSON.parse(raw);
    cache[query.toLowerCase().trim()] = { results, ts: Date.now() };
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const SECTION_QUERIES = {
  recentlyServed: 'Global Top Songs 2024',
  specials: 'Underground jazz lounge music',
  freshKitchen: 'New Music Releases',
  recommendation: 'Lofi dinner jazz beats',
};

const CATEGORY_CARDS = [
  'Jazz Bar',
  'Fine Dining',
  'Late Night',
  'Acoustic',
  'Chef Focus',
  'Soul',
  'All Blue',
  'Candlelight',
];

const DEFAULT_PLAYLISTS = [
  { id: 'all-blue', title: 'All Blue', accent: 'all-blue', kind: 'smart', query: 'ocean jazz chill music' },
  { id: 'candlelit-service', title: 'Candlelit Service', kind: 'smart', query: 'romantic dinner jazz' },
  { id: 'diable-jambe-drive', title: 'Diable Jambe Drive', kind: 'smart', query: 'high energy funk rock' },
  { id: 'after-hours-jazz', title: 'After Hours Jazz', kind: 'smart', query: 'underground jazz bar' },
  { id: 'chef-mise-en-place', title: 'Chef\'s Mise en Place', kind: 'smart', query: 'focus cooking playlist' },
];

function readJsonStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function userPlaylistsOnly(playlists = []) {
  return Array.isArray(playlists) ? playlists.filter((playlist) => playlist?.kind === 'user') : [];
}

function withDefaultPlaylists(savedPlaylists = []) {
  return [...DEFAULT_PLAYLISTS, ...userPlaylistsOnly(savedPlaylists)];
}

function normalizeApiUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function useScrollFade(activeTab, dataKeys) {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('.scroll-fade');
    elements.forEach((el, index) => {
      el.style.setProperty('--stagger', `${Math.min(index * 0.06, 0.48)}s`);
      observer.observe(el);
    });

    return () => {
      elements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [activeTab, dataKeys]);
}

function makeParticles(count, className, durationBase, delayBase) {
  return [...Array(count)].map((_, index) => ({
    id: `${className}-${index}`,
    className,
    style: {
      left: `${Math.random() * 100}%`,
      width: `${2 + Math.random() * 5}px`,
      height: `${2 + Math.random() * 5}px`,
      animationDuration: `${durationBase + Math.random() * durationBase}s`,
      animationDelay: `${Math.random() * delayBase}s`,
      '--drift': `${Math.random() * 90 - 45}px`,
      '--mid-drift': `${Math.random() * 120 - 60}px`,
      '--blur': `${Math.random() * 4}px`,
    },
  }));
}

function FlameLegLogo() {
  return (
    <svg className="flame-leg-logo" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="flameLegGradient" x1="16" y1="8" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFB13B" />
          <stop offset="0.48" stopColor="#FF7A00" />
          <stop offset="1" stopColor="#C45C00" />
        </linearGradient>
      </defs>
      <path className="logo-flame" d="M28 58c-7-6-10-12-8-20 2-7 8-10 8-19 7 7 3 14 11 20 5 4 6 12-1 19 1-5-1-9-5-12 0 5-3 9-5 12Z" />
      <path className="logo-leg" d="M35 8c5 3 7 8 6 14l-2 12c-1 5 1 9 6 12l7 4-4 7-13-7c-6-3-9-9-7-16l3-13c1-4-1-7-4-9l8-4Z" />
      <path className="logo-shoe" d="M43 49c4 0 9 2 12 5-2 4-7 5-13 3l-5-2 3-7 3 1Z" />
    </svg>
  );
}

function EmptyState({ icon = <Flame size={34} />, children }) {
  return (
    <div className="empty-state scroll-fade">
      <div className="empty-icon">{icon}</div>
      <p>{children}</p>
    </div>
  );
}

function MusicCard({ result, onPlay }) {
  return (
    <button className="music-card scroll-fade" onClick={() => onPlay(result, -1)} type="button">
      <div className="card-img-wrapper">
        <img src={result.thumbnail} alt="" />
        <span className="card-ember ember-one" />
        <span className="card-ember ember-two" />
        <div className="card-play-btn">
          <Play fill="currentColor" size={24} style={{ marginLeft: '3px' }} />
        </div>
      </div>
      <div className="card-title">{result.title}</div>
      <div className="card-subtitle">{result.channel}</div>
    </button>
  );
}

function Section({ label, title, children }) {
  return (
    <section className="content-section">
      <div className="section-header scroll-fade">
        <span className="section-label">{label}</span>
        <span className="cigarette-ember-dot" />
        <h2 className="section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AuthScreen({
  mode,
  form,
  error,
  isLoading,
  apiDraft,
  onApiDraftChange,
  onSaveApiSettings,
  onModeChange,
  onFormChange,
  onSubmit,
  onClose,
}) {
  const isRegister = mode === 'register';
  const [showServerTools, setShowServerTools] = useState(false);

  return (
    <div className="auth-shell">
      <div className="bg-effects" aria-hidden="true">
        <div className="suit-pinstripe" />
        <div className="candle-glow" />
      </div>
      <section className="auth-card">
        {onClose && (
          <button className="auth-close-btn" onClick={onClose} type="button" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        <div className="auth-brand">
          <FlameLegLogo />
          <div>
            <span className="logo-kicker">DIABLE</span>
            <h1>Sanji</h1>
          </div>
        </div>
        <p className="auth-copy">Sign in to keep your kitchen, liked songs, and playlists synced across devices.</p>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => onModeChange('login')} type="button">Sign In</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => onModeChange('register')} type="button">Register</button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {isRegister && (
            <label>
              <span>Name</span>
              <input required value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} placeholder="Chef name" />
            </label>
          )}
          <label>
            <span>Email</span>
            <input required type="email" value={form.email} onChange={(e) => onFormChange({ ...form, email: e.target.value })} placeholder="you@example.com" />
          </label>
          <label>
            <span>Password</span>
            <input required minLength="6" type="password" value={form.password} onChange={(e) => onFormChange({ ...form, password: e.target.value })} placeholder="Minimum 6 characters" />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" disabled={isLoading} type="submit">
            {isLoading ? 'Preparing...' : isRegister ? 'Create Account' : 'Enter Sanji'}
          </button>
        </form>

        <button className="auth-server-toggle" onClick={() => setShowServerTools((value) => !value)} type="button">
          Server settings
        </button>

        {showServerTools && (
          <div className="auth-server-tools">
            <label>
              <span>Server URL</span>
              <input value={apiDraft} onChange={(e) => onApiDraftChange(e.target.value)} placeholder="https://your-sanji-server.com" />
            </label>
            <button className="small-action-btn" onClick={onSaveApiSettings} type="button">Save Server</button>
          </div>
        )}
      </section>
    </div>
  );
}

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    return readJsonStorage(STORAGE_KEY, readJsonStorage(LEGACY_STORAGE_KEY, []));
  });
  const [likedSongs, setLikedSongs] = useState(() => readJsonStorage(LIKED_STORAGE_KEY, {}));
  const [playlists, setPlaylists] = useState(() => withDefaultPlaylists(readJsonStorage(PLAYLIST_STORAGE_KEY, [])));
  const [playlistTracks, setPlaylistTracks] = useState({});
  const [selectedCollection, setSelectedCollection] = useState({
    type: 'queue',
    id: 'queue',
    title: 'Prepared Queue',
    label: 'Your Kitchen',
  });
  const [libraryFilter, setLibraryFilter] = useState('songs');
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL);
  const [apiDraft, setApiDraft] = useState(() => localStorage.getItem(API_STORAGE_KEY) || DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_KEY) || '');
  const [authUser, setAuthUser] = useState(() => readJsonStorage(AUTH_USER_KEY, null));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [remoteLibraryLoaded, setRemoteLibraryLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState('Home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [homeData, setHomeData] = useState({
    recentlyServed: [],
    specials: [],
    freshKitchen: [],
    recommendation: [],
  });

  const audioRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const currentSong = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  const smokeParticles = useMemo(() => makeParticles(34, 'smoke-particle', 16, 18), []);
  const emberParticles = useMemo(() => makeParticles(22, 'ember', 8, 12), []);
  const dataKeys = [
    activeTab,
    recentlyPlayed.map((song) => song.videoId).join(','),
    searchResults.map((song) => song.videoId).join(','),
    queue.map((song) => song.videoId).join(','),
    Object.keys(likedSongs).join(','),
    playlists.map((playlist) => `${playlist.id}:${playlist.title}:${playlist.tracks?.length || 0}`).join(','),
    Object.values(playlistTracks).flat().map((song) => song.videoId).join(','),
    homeData.recentlyServed.map((song) => song.videoId).join(','),
    homeData.specials.map((song) => song.videoId).join(','),
    homeData.freshKitchen.map((song) => song.videoId).join(','),
    homeData.recommendation.map((song) => song.videoId).join(','),
  ].join('|');

  useScrollFade(activeTab, dataKeys);

  useEffect(() => {
    document.title = 'Sanji - Music Streaming';
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recentlyPlayed));
  }, [recentlyPlayed]);

  useEffect(() => {
    localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify(likedSongs));
  }, [likedSongs]);

  useEffect(() => {
    localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(userPlaylistsOnly(playlists)));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem(API_STORAGE_KEY, apiUrl);
  }, [apiUrl]);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, [authToken]);

  useEffect(() => {
    if (authUser) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
    } else {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }, [authUser]);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const fetchSection = async (query) => {
          const cached = getSearchCache(query);
          if (cached) return cached;
          const res = await fetch(`${apiUrl}/search?q=${encodeURIComponent(query)}`);
          const data = await res.json();
          const results = data.results || [];
          setSearchCache(query, results);
          return results;
        };

        const [recentlyServed, specials, freshKitchen, recommendation] = await Promise.all([
          fetchSection(SECTION_QUERIES.recentlyServed),
          fetchSection(SECTION_QUERIES.specials),
          fetchSection(SECTION_QUERIES.freshKitchen),
          fetchSection(SECTION_QUERIES.recommendation),
        ]);

        setHomeData({ recentlyServed, specials, freshKitchen, recommendation });
      } catch (err) {
        console.error('Failed to load home data', err);
      }
    };

    loadHomeData();

    // Pre-cache category card smart playlist queries
    const commonQueries = [
      ...CATEGORY_CARDS,
      ...DEFAULT_PLAYLISTS.map((p) => p.query),
    ];
    for (const q of new Set(commonQueries)) {
      if (!getSearchCache(q)) fetch(`${apiUrl}/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { if (d.results) setSearchCache(q, d.results); })
        .catch(() => {});
    }
  }, [apiUrl]);

  useEffect(() => {
    if (!authToken) return undefined;

    let cancelled = false;

    const loadRemoteLibrary = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/library`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        if (response.status === 401) {
          setAuthToken('');
          setAuthUser(null);
          setRemoteLibraryLoaded(false);
          return;
        }

        if (!response.ok) throw new Error('Library sync failed');
        const data = await response.json();
        if (cancelled) return;

        setLikedSongs(data.likedSongs || {});
        setRecentlyPlayed(Array.isArray(data.recentlyPlayed) ? data.recentlyPlayed : []);
        setPlaylists(withDefaultPlaylists(data.playlists || []));
        setRemoteLibraryLoaded(true);
      } catch (error) {
        console.error('Library load failed:', error);
        if (!cancelled) setRemoteLibraryLoaded(true);
      }
    };

    loadRemoteLibrary();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, authToken]);

  useEffect(() => {
    if (!authToken || !remoteLibraryLoaded) return undefined;

    const timer = setTimeout(async () => {
      try {
        await fetch(`${apiUrl}/api/library`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            likedSongs,
            playlists: userPlaylistsOnly(playlists),
            recentlyPlayed,
          }),
        });
      } catch (error) {
        console.error('Library sync failed:', error);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [apiUrl, authToken, likedSongs, playlists, recentlyPlayed, remoteLibraryLoaded]);

  const navigateTo = (tab) => {
    if (tab === activeTab) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsTransitioning(false);
    }, 350);
  };

  const openLibraryQueue = () => {
    setLibraryFilter('songs');
    setSelectedCollection({
      type: 'queue',
      id: 'queue',
      title: 'Prepared Queue',
      label: 'Your Kitchen',
    });
    navigateTo('Library');
  };

  const openLikedSongs = () => {
    setLibraryFilter('songs');
    setSelectedCollection({
      type: 'liked',
      id: 'liked',
      title: 'Liked Songs',
      label: 'Flame-Kissed Favorites',
    });
    navigateTo('Library');
  };

  const openPlaylist = async (playlist) => {
    setLibraryFilter('songs');
    setSelectedCollection({
      type: 'playlist',
      id: playlist.id,
      title: playlist.title,
      label: playlist.kind === 'smart' ? 'Chef\'s Menu' : 'Custom Menu',
    });
    navigateTo('Library');

    if (playlist.kind === 'smart' && !playlistTracks[playlist.id]) {
      setIsLoadingCollection(true);
      try {
        const response = await fetch(`${apiUrl}/search?q=${encodeURIComponent(playlist.query)}`);
        const data = await response.json();
        setPlaylistTracks((prev) => ({ ...prev, [playlist.id]: data.results || [] }));
      } catch (error) {
        console.error('Playlist load failed:', error);
      } finally {
        setIsLoadingCollection(false);
      }
    }
  };

  const createPlaylist = () => {
    const name = window.prompt('Name your menu');
    const title = name?.trim();
    if (!title) return;

    const playlist = {
      id: `menu-${Date.now()}`,
      title,
      kind: 'user',
      tracks: [],
    };

    setPlaylists((prev) => [...prev, playlist]);
    setLibraryFilter('songs');
    setSelectedCollection({
      type: 'playlist',
      id: playlist.id,
      title: playlist.title,
      label: 'Custom Menu',
    });
    navigateTo('Library');
  };

  const addCurrentSongToSelectedPlaylist = () => {
    if (!currentSong || selectedCollection.type !== 'playlist') return;

    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== selectedCollection.id || playlist.kind !== 'user') return playlist;
      const tracks = playlist.tracks || [];
      if (tracks.some((song) => song.videoId === currentSong.videoId)) return playlist;
      return { ...playlist, tracks: [currentSong, ...tracks] };
    }));
  };

  const openPlaylistOverview = () => {
    setLibraryFilter('playlists');
    navigateTo('Library');
  };

  const openRecentlyServed = () => {
    setLibraryFilter('recent');
    navigateTo('Library');
  };

  const applyApiSettings = () => {
    const nextUrl = normalizeApiUrl(apiDraft);
    if (!nextUrl) return;
    setApiDraft(nextUrl);
    setApiUrl(nextUrl);
    setShowSettings(false);
    setAuthError('');
  };

  const saveApiSettings = (e) => {
    e.preventDefault();
    applyApiSettings();
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    try {
      const endpoint = authMode === 'register' ? 'register' : 'login';
      const serverUrl = normalizeApiUrl(apiDraft) || apiUrl;
      if (serverUrl !== apiUrl) {
        setApiUrl(serverUrl);
        setApiDraft(serverUrl);
        localStorage.setItem(API_STORAGE_KEY, serverUrl);
      }

      const response = await fetch(`${serverUrl}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to sign in right now');
      }

      if (authMode === 'register') {
        await fetch(`${serverUrl}/api/library`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
          },
          body: JSON.stringify({
            likedSongs,
            playlists: userPlaylistsOnly(playlists),
            recentlyPlayed,
          }),
        });
      }

      setAuthToken(data.token);
      setAuthUser(data.user);
      setShowAuthModal(false);
      setRemoteLibraryLoaded(false);
      setAuthForm({ name: '', email: '', password: '' });
      setActiveTab('Home');
    } catch (error) {
      setAuthError(error.message.includes('Failed to fetch')
        ? `Cannot reach the Sanji server at ${normalizeApiUrl(apiDraft) || apiUrl}. Open that address in this phone browser and make sure it includes http://.`
        : error.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logoutUser = () => {
    if (audioRef.current) audioRef.current.pause();
    setAuthToken('');
    setAuthUser(null);
    setRemoteLibraryLoaded(false);
    setIsPlaying(false);
    setCurrentIndex(-1);
    setQueue([]);
    setActiveTab('Home');
    setShowSettings(false);
  };

  const addToRecent = (song) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((s) => s.videoId !== song.videoId);
      return [song, ...filtered].slice(0, 10);
    });
  };

  const toggleLike = (e, song) => {
    e.stopPropagation();
    if (!song?.videoId) return;
    if (!authToken) {
      setShowAuthModal(true);
      return;
    }
    setLikedSongs((prev) => {
      const next = { ...prev };
      if (next[song.videoId]) {
        delete next[song.videoId];
      } else {
        next[song.videoId] = song;
      }
      return next;
    });
  };

  const triggerLadyToastIfNeeded = (query) => {
    const normalized = query.toLowerCase();
    if (normalized.includes('nami') || normalized.includes('robin')) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    }
  };

  const executeSearch = useCallback(async (query) => {
    const cached = getSearchCache(query);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
    }
    if (!cached) setIsSearching(true);
    try {
      const response = await fetch(`${apiUrl}/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      const results = data.results || [];
      setSearchResults(results);
      setSearchCache(query, results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      const t = setTimeout(() => setSearchResults([]), 0);
      return () => clearTimeout(t);
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(query);
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, executeSearch]);

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    triggerLadyToastIfNeeded(query);
    navigateTo('Search');
    executeSearch(query);
  };

  const quickSearch = (query) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    navigateTo('Search');
    executeSearch(query);
  };

  const playSong = (song, idx = -1) => {
    let newIndex = idx;

    if (idx === -1) {
      const newQueue = [...queue, song];
      newIndex = newQueue.length - 1;
      setQueue(newQueue);
    }

    setCurrentIndex(newIndex);
    addToRecent(song);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = `${apiUrl}/stream/${song.videoId}`;
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error('Play error:', err);
          setIsPlaying(false);
        });
    }
  };

  const togglePlayPause = () => {
    if (!currentSong || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const playNext = () => {
    if (repeatMode === 'one' && currentSong) {
      playSong(currentSong, currentIndex);
      return;
    }

    if (isShuffle && queue.length > 1) {
      const nextIndex = (currentIndex + 2) % queue.length;
      playSong(queue[nextIndex], nextIndex);
      return;
    }

    if (currentIndex < queue.length - 1) {
      playSong(queue[currentIndex + 1], currentIndex + 1);
    } else if (repeatMode === 'all' && queue.length > 0) {
      playSong(queue[0], 0);
    } else {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
  };

  const playPrev = () => {
    if (currentIndex > 0) {
      playSong(queue[currentIndex - 1], currentIndex - 1);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current && currentSong) {
      const current = audioRef.current.currentTime;
      setCurrentTime(current);
      const total = currentSong.durationSeconds || 1;
      setProgress(Math.min((current / total) * 100, 100));
    }
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !currentSong) return;
    const bar = e.currentTarget;
    const clickX = e.clientX - bar.getBoundingClientRect().left;
    const percentage = clickX / bar.clientWidth;

    if (currentSong.durationSeconds) {
      audioRef.current.currentTime = percentage * currentSong.durationSeconds;
      setCurrentTime(percentage * currentSong.durationSeconds);
      setProgress(percentage * 100);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderCards = (items, emptyText) => (
    items.length > 0 ? (
      <div className="card-grid">
        {items.map((result) => (
          <MusicCard key={result.videoId} result={result} onPlay={playSong} />
        ))}
      </div>
    ) : (
      <EmptyState>{emptyText}</EmptyState>
    )
  );

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedCollection.id);
  const collectionItems = (() => {
    if (selectedCollection.type === 'liked') return Object.values(likedSongs);
    if (selectedCollection.type === 'playlist') {
      if (selectedPlaylist?.kind === 'smart') return playlistTracks[selectedCollection.id] || [];
      return selectedPlaylist?.tracks || [];
    }
    return queue;
  })();

  const playCollectionSong = (song, idx) => {
    if (selectedCollection.type === 'queue') {
      playSong(song, idx);
    } else {
      playSong(song, -1);
    }
  };

  const likedCount = Object.keys(likedSongs).length;

  return (
    <div className="app-wrapper">

      {showAuthModal && (
        <div className="auth-overlay">
          <AuthScreen
            mode={authMode}
            form={authForm}
            error={authError}
            isLoading={isAuthLoading}
            apiDraft={apiDraft}
            onApiDraftChange={setApiDraft}
            onSaveApiSettings={applyApiSettings}
            onModeChange={(mode) => {
              setAuthMode(mode);
              setAuthError('');
            }}
            onFormChange={setAuthForm}
            onSubmit={handleAuthSubmit}
            onClose={() => { setShowAuthModal(false); setAuthError(''); }}
          />
        </div>
      )}
      <div className="bg-effects" aria-hidden="true">
        <div className="suit-pinstripe" />
        <div className="candle-glow" />
        {smokeParticles.map((particle) => (
          <span key={particle.id} className={particle.className} style={particle.style} />
        ))}
        {emberParticles.map((particle) => (
          <span key={particle.id} className={particle.className} style={particle.style} />
        ))}
      </div>

      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-candle" />
          <div className="intro-word">Sanji</div>
        </div>
      )}

      <div className="page-transition-overlay" aria-hidden="true">
        <div className={`match-sweep ${isTransitioning ? 'active' : ''}`} />
      </div>

      {showToast && (
        <div className="toast-note">♡ A song worthy of a goddess ♡</div>
      )}

      {showSettings && (
        <div className="settings-backdrop" role="presentation" onClick={() => setShowSettings(false)}>
          <form className="settings-panel" onSubmit={saveApiSettings} onClick={(e) => e.stopPropagation()}>
            <span className="section-label">Account & Server</span>
            <h2>Sanji Settings</h2>
            <p>
              Your account keeps liked songs, playlists, and recently served tracks synced through the Sanji server.
            </p>
            <div className="settings-account">
              <div>
                <span>Signed in as</span>
                <strong>{authUser.name}</strong>
                <small>{authUser.email}</small>
              </div>
              <button className="small-action-btn secondary" onClick={logoutUser} type="button">Sign Out</button>
            </div>
            <label className="settings-label" htmlFor="api-url">Server URL</label>
            <input
              id="api-url"
              className="settings-input"
              value={apiDraft}
              onChange={(e) => setApiDraft(e.target.value)}
              placeholder="http://192.168.1.10:5000"
            />
            <div className="settings-actions">
              <button className="small-action-btn" type="submit">Save</button>
              <button className="small-action-btn secondary" onClick={() => setShowSettings(false)} type="button">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="main-layout">
        <aside className="left-sidebar">
          <div className="sidebar-content">
            <button className="logo-block" onClick={() => navigateTo('Home')} type="button" aria-label="Go home">
              <FlameLegLogo />
              <div>
                <div className="logo-kicker">DIABLE</div>
                <div className="logo-text">Sanji</div>
              </div>
            </button>

            <nav className="nav-links" aria-label="Primary navigation">
              <button className={`nav-link ${activeTab === 'Home' ? 'active' : ''}`} onClick={() => navigateTo('Home')} type="button">
                <Flame size={22} /> <span>Home</span>
              </button>
              <button className={`nav-link ${activeTab === 'Search' ? 'active' : ''}`} onClick={() => navigateTo('Search')} type="button">
                <Search size={22} /> <span>Search</span>
              </button>
              <button className={`nav-link ${activeTab === 'Library' && selectedCollection.type === 'queue' ? 'active' : ''}`} onClick={openLibraryQueue} type="button">
                <Utensils size={22} /> <span>Your Kitchen</span>
              </button>
            </nav>
          </div>

          <div className="sidebar-divider" />

          <div className="sidebar-section">
            <button className="create-playlist-btn" onClick={createPlaylist} type="button">
              <Plus size={17} /> <span>Create Menu</span>
            </button>
            <button className={`liked-link ${activeTab === 'Library' && selectedCollection.type === 'liked' ? 'active' : ''}`} onClick={openLikedSongs} type="button">
              <Heart size={17} fill="currentColor" /> <span>Liked Songs</span>
              <span className="sidebar-count">{likedCount}</span>
            </button>

            <div className="playlist-stack">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className={`playlist-item ${playlist.accent || ''} ${activeTab === 'Library' && selectedCollection.id === playlist.id ? 'active' : ''}`}
                  onClick={() => openPlaylist(playlist)}
                  type="button"
                  title={playlist.title}
                >
                  <span>{playlist.title}</span>
                  <span className="sidebar-count">{playlist.kind === 'smart' ? 'Mix' : playlist.tracks?.length || 0}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="center-panel">
          <header className="top-bar">
            <div className="top-bar-nav">
              <button className="nav-arrow" onClick={() => navigateTo('Home')} type="button" aria-label="Back">
                <ChevronLeft size={22} />
              </button>
              <button className="nav-arrow" type="button" aria-label="Forward">
                <ChevronRight size={22} />
              </button>
            </div>

            <form className="search-wrapper" onSubmit={handleSearch}>
              <Search className="search-icon" size={19} />
              <input
                type="text"
                className="search-input"
                placeholder="Search songs, artists, albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => navigateTo('Search')}
              />
            </form>

            <button className="user-profile" onClick={() => authUser ? setShowSettings(true) : setShowAuthModal(true)} type="button">
              <div className="avatar"><User size={18} /></div>
              <span>{authUser ? authUser.name || 'Chef' : 'Sign In'}</span>
              <ChevronDown size={15} />
            </button>
          </header>

          <div className={`content-area ${!isTransitioning ? 'fade-in-content' : ''}`}>
            {activeTab === 'Home' && (
              <>
                <section className="hero-banner scroll-fade">
                  <div className="hero-smoke" />
                  <div className="hero-copy">
                    <span className="hero-label">Sanji - Music Streaming</span>
                    <h1 className="hero-title">COOKED TO PERFECTION</h1>
                    <p className="hero-sub">Music as refined as the finest cuisine.</p>
                  </div>
                  <div className="hero-mark">
                    <ChefHat size={42} />
                    <span>Tonight's service is live</span>
                  </div>
                </section>

                {recentlyPlayed.length > 0 && (
                  <Section label="Recently Served" title="Recents">
                    {renderCards(recentlyPlayed.slice(0, 8), 'The kitchen is empty. Find your ingredients.')}
                  </Section>
                )}

                <Section label="Trending Tonight" title="Trending">
                  {renderCards(homeData.specials, 'Sharpening the knives for tonight.')}
                </Section>

                <Section label="Chef's Specials" title="Picked for You">
                  {renderCards(homeData.freshKitchen, 'Fresh dishes are still on the pass.')}
                </Section>

                <Section label="Chef's Recommendation" title="Recommended">
                  {renderCards(homeData.recommendation, 'The chef is tasting the sauce.')}
                </Section>
              </>
            )}

            {activeTab === 'Search' && (
              <>
                <section className="search-hero scroll-fade">
                  <span className="section-label">Menu Board</span>
                  <h1>What are we serving?</h1>
                  <form className="large-search" onSubmit={handleSearch}>
                    <Search size={24} />
                    <input
                      type="text"
                      placeholder="Search songs, artists, albums..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </form>
                </section>

                {searchResults.length === 0 && !isSearching && (
                  <section className="category-grid">
                    {CATEGORY_CARDS.map((category) => (
                      <button className="category-card scroll-fade" key={category} onClick={() => quickSearch(category)} type="button">
                        <span>{category}</span>
                        <small>Chef's menu</small>
                      </button>
                    ))}
                  </section>
                )}

                <Section label="Search" title="Results">
                  {isSearching ? (
                    <div className="skeleton-grid">
                      {[...Array(8)].map((_, index) => <span key={index} className="skeleton-card" />)}
                    </div>
                  ) : searchResults.length > 0 ? (
                    renderCards(searchResults, 'The kitchen is empty. Find your ingredients.')
                  ) : (
                    <EmptyState icon={<Search size={34} />}>The kitchen is empty. Find your ingredients.</EmptyState>
                  )}
                </Section>
              </>
            )}

            {activeTab === 'Library' && (
              <>
                <section className="library-hero scroll-fade">
                  <span className="section-label">
                    {libraryFilter === 'playlists' ? 'Menus' : libraryFilter === 'recent' ? 'Recently Served' : selectedCollection.label}
                  </span>
                  <h1>
                    {libraryFilter === 'playlists' ? 'Your Menus' : libraryFilter === 'recent' ? 'Recently Played' : selectedCollection.title}
                  </h1>
                  <div className="filter-pills">
                    <button className={`filter-pill ${libraryFilter === 'songs' ? 'active' : ''}`} onClick={openLibraryQueue} type="button">Songs</button>
                    <button className={`filter-pill ${libraryFilter === 'playlists' ? 'active' : ''}`} onClick={openPlaylistOverview} type="button">Playlists</button>
                    <button className={`filter-pill ${libraryFilter === 'recent' ? 'active' : ''}`} onClick={openRecentlyServed} type="button">Recent</button>
                  </div>
                  {libraryFilter === 'songs' && selectedCollection.type === 'playlist' && selectedPlaylist?.kind === 'user' && (
                    <div className="collection-actions">
                      <button className="small-action-btn" onClick={addCurrentSongToSelectedPlaylist} disabled={!currentSong} type="button">
                        <Plus size={16} /> Add Current Song
                      </button>
                      <span className="library-meta">{selectedPlaylist.tracks?.length || 0} tracks</span>
                    </div>
                  )}
                </section>

                {libraryFilter === 'playlists' ? (
                  <section className="category-grid">
                    <button className="category-card create-menu-card scroll-fade" onClick={createPlaylist} type="button">
                      <span>Create Menu</span>
                      <small>Start fresh</small>
                    </button>
                    {playlists.map((playlist) => (
                      <button className={`category-card scroll-fade ${playlist.accent || ''}`} key={playlist.id} onClick={() => openPlaylist(playlist)} type="button">
                        <span>{playlist.title}</span>
                        <small>{playlist.kind === 'smart' ? 'Chef mix' : `${playlist.tracks?.length || 0} tracks`}</small>
                      </button>
                    ))}
                  </section>
                ) : libraryFilter === 'recent' ? (
                  recentlyPlayed.length > 0 ? (
                    renderCards(recentlyPlayed, 'The kitchen is empty. Find your ingredients.')
                  ) : (
                    <EmptyState icon={<ChefHat size={34} />}>The kitchen is empty. Find your ingredients.</EmptyState>
                  )
                ) : isLoadingCollection ? (
                  <div className="skeleton-list">
                    {[...Array(6)].map((_, index) => <span key={index} className="skeleton-row" />)}
                  </div>
                ) : collectionItems.length > 0 ? (
                  <div className="track-list">
                    {collectionItems.map((song, idx) => (
                      <button
                        key={`${song.videoId}-${idx}`}
                        className={`list-row scroll-fade ${currentSong?.videoId === song.videoId ? 'active' : ''}`}
                        onClick={() => playCollectionSong(song, idx)}
                        type="button"
                      >
                        <span className="track-number">{currentSong?.videoId === song.videoId ? <Flame size={16} /> : idx + 1}</span>
                        <img src={song.thumbnail} alt="" />
                        <span className="list-info">
                          <span className="list-title">{song.title}</span>
                          <span className="list-sub">{song.channel}</span>
                        </span>
                        <span className="track-duration">{song.duration}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Utensils size={34} />}>Even the greatest chef needs a menu. Create one.</EmptyState>
                )}
              </>
            )}

            <footer className="site-footer scroll-fade">
              <div className="footer-divider" />
              <div className="footer-title">DIABLE - Music for Connoisseurs</div>
              <div className="footer-sub">Every track. Perfectly cooked.</div>
            </footer>
          </div>
        </main>
      </div>

      <audio ref={audioRef} onEnded={playNext} onTimeUpdate={onTimeUpdate} />

      <div className="player-bar">
        <div className="player-left">
          {currentSong ? (
            <>
              <div className="player-art-wrap" key={currentSong.videoId}>
                <img src={currentSong.thumbnail} alt="" />
                <span className="art-spark spark-a" />
                <span className="art-spark spark-b" />
                <span className="art-spark spark-c" />
              </div>
              <div className="player-info">
                <div className="player-title">{currentSong.title}</div>
                <div className="player-artist">{currentSong.channel}</div>
              </div>
              <button className={`heart-btn ${likedSongs[currentSong.videoId] ? 'liked' : ''}`} onClick={(e) => toggleLike(e, currentSong)} type="button" aria-label="Like song">
                <Heart size={18} fill={likedSongs[currentSong.videoId] ? 'currentColor' : 'none'} />
              </button>
            </>
          ) : (
            <div className="player-empty">The kitchen is ready.</div>
          )}
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className={`ctrl-btn ${isShuffle ? 'active' : ''}`} onClick={() => setIsShuffle((prev) => !prev)} type="button" aria-label="Shuffle"><Shuffle size={17} /></button>
            <button className="ctrl-btn" onClick={playPrev} type="button" aria-label="Previous"><SkipBack size={20} fill="currentColor" /></button>
            <button className={`play-pause-btn ${isPlaying ? 'ripple' : ''}`} onClick={togglePlayPause} type="button" aria-label="Play or pause">
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: '2px' }} />}
            </button>
            <span className={`mini-equalizer ${isPlaying ? 'playing' : ''}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <button className="ctrl-btn" onClick={playNext} type="button" aria-label="Next"><SkipForward size={20} fill="currentColor" /></button>
            <button
              className={`ctrl-btn ${repeatMode !== 'off' ? 'active' : ''}`}
              onClick={() => setRepeatMode((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))}
              type="button"
              aria-label={`Repeat ${repeatMode}`}
              title={repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off'}
            >
              <Repeat2 size={17} />
              {repeatMode === 'one' && <span className="repeat-one">1</span>}
            </button>
          </div>
          <div className="progress-container">
            <span>{formatTime(currentTime)}</span>
            <div className="progress-bg" onClick={handleProgressClick} role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)} tabIndex="0">
              <div className="progress-fill" style={{ width: `${progress}%` }}>
                <div className="progress-thumb" />
              </div>
            </div>
            <span>{currentSong ? currentSong.duration : '0:00'}</span>
          </div>
        </div>

        <div className="player-right">
          <Mic2 size={16} className="player-icon" />
          <ListMusic size={16} className="player-icon" onClick={openLibraryQueue} />
          <button className="ctrl-btn" onClick={() => setIsMuted(!isMuted)} type="button" aria-label="Mute">
            {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            className="volume-slider"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (parseFloat(e.target.value) > 0) setIsMuted(false);
            }}
            style={{ backgroundSize: `${(isMuted ? 0 : volume) * 100}% 100%` }}
            aria-label="Volume"
          />
          <Maximize2 size={16} className="player-icon" />
        </div>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={activeTab === 'Home' ? 'active' : ''} onClick={() => navigateTo('Home')} type="button"><Home size={20} /><span>Home</span></button>
        <button className={activeTab === 'Search' ? 'active' : ''} onClick={() => navigateTo('Search')} type="button"><Search size={20} /><span>Search</span></button>
        <button type="button" onClick={togglePlayPause} className="mobile-play">{isPlaying ? <Pause size={20} /> : <Play size={20} />}</button>
        <button className={activeTab === 'Library' && selectedCollection.type === 'queue' ? 'active' : ''} onClick={openLibraryQueue} type="button"><Library size={20} /><span>Kitchen</span></button>
        <button className={activeTab === 'Library' && selectedCollection.type === 'liked' ? 'active' : ''} onClick={openLikedSongs} type="button"><Heart size={20} /><span>Liked</span></button>
      </nav>
    </div>
  );
}

export default App;
