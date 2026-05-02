export const getLocalizedField = (
  obj: Record<string, any> | null | undefined,
  fieldName: string,
  lang: 'tr' | 'en' | string
): string => {
  if (!obj) return ''
  if (lang === 'en') {
    const enValue = obj[`${fieldName}_en`]
    if (enValue && typeof enValue === 'string' && enValue.trim().length > 0) {
      return enValue
    }
  }
  return obj[fieldName] || ''
}
