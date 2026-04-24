export const SIPARIS_DURUM = {
  YENI: "yeni",
  HAZIRLANIYOR: "hazirlaniyor",
  HAZIR: "hazir",
  YOLDA: "yolda",
  TESLIM_EDILDI: "teslim_edildi",
} as const;

export type SiparisDurumType = (typeof SIPARIS_DURUM)[keyof typeof SIPARIS_DURUM];
