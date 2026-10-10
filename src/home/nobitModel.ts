/** ノビットの表情の対応表（画面に依存しない）。ファイルは public/nobit/<名前>.png（design/nobit/cut から使うものだけをコピーする） */
export type NobitMood =
  | 'front'      // 既定
  | 'happy'      // タスク完了の瞬間（02）
  | 'cheer'      // 15分集中の達成（03）
  | 'excited'    // ガチャを引く前（05）
  | 'joy'        // ガチャ：レア
  | 'jump'       // ガチャ：スーパーレア
  | 'thanks'     // ガチャ：重複（コインに交換）
  | 'wave'       // 記録が途切れたあとの再開（08）

export const MOOD_FILE: Record<NobitMood, string> = {
  front: 'front',
  happy: 'expr_happy',
  cheer: 'expr_cheer',
  excited: 'expr_excited',
  joy: 'expr_joy',
  jump: 'expr_jump',
  thanks: 'expr_thanks',
  wave: 'expr_wave',
}

export const nobitSrc = (mood: NobitMood): string => `/nobit/${MOOD_FILE[mood]}.png`

/** ガチャの結果に合わせた表情。重複は感謝、ほかはレアリティで */
export function gachaMood(result: { rarity: 'normal' | 'rare' | 'super_rare'; duplicate: boolean } | null): NobitMood {
  if (!result) return 'excited'
  if (result.duplicate) return 'thanks'
  return result.rarity === 'super_rare' ? 'jump' : result.rarity === 'rare' ? 'joy' : 'happy'
}

