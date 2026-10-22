// Farbklassen je Modus — dieselbe Palette wie in orch-spec, damit beide Apps
// gleich aussehen. Bewusst klein gehalten.
export const cls = (isDark: boolean) => ({
  bg: isDark ? 'bg-[#0e0f11]' : 'bg-[#f5f4f0]',
  panel: isDark ? 'bg-white/2' : 'bg-black/2',
  panelStrong: isDark ? 'bg-[#16171a]' : 'bg-white',
  top: isDark ? 'bg-[#0c0d0f]' : 'bg-[#eae9e5]',
  border: isDark ? 'border-white/8' : 'border-black/8',
  border2: isDark ? 'border-white/15' : 'border-black/15',
  text: isDark ? 'text-white' : 'text-black',
  muted: isDark ? 'text-white/40' : 'text-black/40',
  muted2: isDark ? 'text-white/60' : 'text-black/60',
  hover: isDark ? 'hover:bg-white/5' : 'hover:bg-black/5',
  input: isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-white/30'
    : 'bg-black/5 border-black/10 text-black placeholder-black/20 focus:border-black/30',
  btn: isDark
    ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white'
    : 'border-black/15 text-black/50 hover:border-black/30 hover:text-black',
  btnPrimary: isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/80',
});
