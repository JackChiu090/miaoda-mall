// 首页 Banner 轮播组件
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Banner {
  id: string;
  image_url: string;
  title: string;
  subtitle: string;
  link_path: string;
  sort_order: number;
}

interface BannerSettings {
  autoplayInterval: number;   // 自动播放间隔 ms
  transitionDuration: number; // 切换动画时长 ms
}

const DEFAULT_SETTINGS: BannerSettings = { autoplayInterval: 3500, transitionDuration: 450 };
const PLACEHOLDER_GRADIENT = [
  'linear-gradient(135deg,#8B0000 0%,#1a1a1a 100%)',
  'linear-gradient(135deg,#1a1a1a 0%,#8B0000 100%)',
  'linear-gradient(135deg,#8B0000 0%,#DC143C 50%,#1a1a1a 100%)',
];

export default function BannerCarousel() {
  const [banners, setBanners]     = useState<Banner[]>([]);
  const [settings, setSettings]   = useState<BannerSettings>(DEFAULT_SETTINGS);
  const [current, setCurrent]     = useState(0);
  const [paused, setPaused]       = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载 banner 列表和配置
  useEffect(() => {
    Promise.all([
      supabase
        .from('banners')
        .select('id,image_url,title,subtitle,link_path,sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('banner_settings').select('key,value'),
    ]).then(([bRes, sRes]) => {
      setBanners(bRes.data ?? []);
      if (sRes.data) {
        const m: Record<string, string> = {};
        sRes.data.forEach(r => { m[r.key] = r.value; });
        setSettings({
          autoplayInterval:   Number(m['autoplay_interval']   ?? 3500),
          transitionDuration: Number(m['transition_duration'] ?? 450),
        });
      }
    });
  }, []);

  const goTo = useCallback((idx: number) => {
    if (transitioning || banners.length === 0) return;
    setTransitioning(true);
    setCurrent(idx);
    setTimeout(() => setTransitioning(false), settings.transitionDuration + 50);
  }, [transitioning, banners.length, settings.transitionDuration]);

  const prev = useCallback(() => {
    goTo((current - 1 + banners.length) % banners.length);
  }, [current, banners.length, goTo]);

  const next = useCallback(() => {
    goTo((current + 1) % banners.length);
  }, [current, banners.length, goTo]);

  // 自动播放
  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    timerRef.current = setInterval(next, settings.autoplayInterval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, paused, settings.autoplayInterval, next]);

  // 触摸滑动支持
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); }
    touchStartX.current = null;
  };

  if (banners.length === 0) {
    // 无 Banner 时显示占位提示卡（仅渲染骨架，不影响布局）
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl flex items-center justify-center"
        style={{ aspectRatio: '16/5', background: 'linear-gradient(135deg,#8B0000 0%,#1a1a1a 100%)' }}
      >
        <div className="text-center">
          <p className="text-white/60 text-sm font-medium">暂无 Banner</p>
          <p className="text-white/35 text-xs mt-1">请在后台「Banner 管理」上传图片</p>
        </div>
      </div>
    );
  }

  const transStyle = {
    transition: `transform ${settings.transitionDuration}ms cubic-bezier(0.25,0.46,0.45,0.94)`,
    transform:  `translateX(-${current * 100}%)`,
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl select-none"
      style={{ aspectRatio: '16/5' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 轨道 */}
      <div className="flex h-full" style={transStyle}>
        {banners.map((b, i) => {
          const inner = (
            <div className="relative w-full h-full flex-shrink-0">
              {b.image_url ? (
                <img
                  src={b.image_url}
                  alt={b.title}
                  className="w-full h-full object-cover"
                  draggable={false}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: PLACEHOLDER_GRADIENT[i % PLACEHOLDER_GRADIENT.length] }}
                />
              )}
              {/* 渐变蒙层 + 文字 */}
              {(b.title || b.subtitle) && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex flex-col justify-end px-4 pb-8">
                  {b.title   && <p className="text-white font-bold text-base leading-snug drop-shadow text-balance">{b.title}</p>}
                  {b.subtitle && <p className="text-white/80 text-xs mt-0.5 truncate">{b.subtitle}</p>}
                </div>
              )}
            </div>
          );
          return b.link_path ? (
            <Link key={b.id} to={b.link_path} className="flex-shrink-0 w-full h-full block">
              {inner}
            </Link>
          ) : (
            <div key={b.id} className="flex-shrink-0 w-full h-full">{inner}</div>
          );
        })}
      </div>

      {/* 左右切换按钮（多于1张才显示） */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all"
          >
            <ChevronRight size={15} />
          </button>
        </>
      )}

      {/* 进度指示点 */}
      {banners.length > 1 && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? 'w-5 h-1.5 bg-white'
                  : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      )}

      {/* 暂停状态角标 */}
      {paused && banners.length > 1 && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/40 text-white/70 text-[10px]">
          已暂停
        </div>
      )}
    </div>
  );
}
