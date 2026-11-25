import $L from '../../services/i18n.js'

// Built on first use so the labels come out translated.
let presets
export const getQualityPresets = () =>
  presets ||
  (presets = [
    { label: $L('Auto'), value: null },
    { label: $L('4K (60 Mbps)'), value: 60000000, minRes: 3840 },
    { label: $L('1080p (20 Mbps)'), value: 20000000, minRes: 1920 },
    { label: $L('1080p (10 Mbps)'), value: 10000000, minRes: 1920 },
    { label: $L('720p (8 Mbps)'), value: 8000000, minRes: 1280 },
    { label: $L('720p (4 Mbps)'), value: 4000000, minRes: 1280 },
    { label: $L('480p (2 Mbps)'), value: 2000000, minRes: 854 },
    { label: $L('360p (1 Mbps)'), value: 1000000, minRes: 640 },
  ])
