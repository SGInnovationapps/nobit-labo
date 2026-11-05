/** ノビットの表情の対応表（画面に依存しない）。ファイルは public/nobit/<名前>.png（600px の切り抜き） */
export type NobitMood =
  | 'front'      // 既定
  | 'happy'      // ホーム：教科を記録した直後／ガチャ：ノーマル
  | 'celebrate'  // 記録の瞬間（02）
  | 'cheer'      // 15分集中の達成（03）
  | 'excited'    // ガチャを引く前（05）
  | 'surprised'  // ガチャの演出中
  | 'joy'        // ガチャ：レア
  | 'jump'       // ガチャ：スーパーレア
  | 'thanks'     // ガチャ：もう持っていた（コインに交換）
  | 'wave'       // ホーム：今日まだ・はじめて／記録が途切れたあとの再開（08）

export const MOOD_FILE: Record<NobitMood, string> = {
  front: 'front',
  happy: 'happy',
  celebrate: 'celebrate',
  cheer: 'determined',
  excited: 'starry-eyes',
  surprised: 'surprised',
  joy: 'smile-sparkle',
  jump: 'celebrate',
  thanks: 'pose-coin',
  wave: 'wave',
}

export const nobitSrc = (mood: NobitMood): string => `/nobit/${MOOD_FILE[mood]}.png`

/** ガチャの結果に合わせた表情。もう持っていたときは感謝、ほかはレアリティで */
export function gachaMood(result: { rarity: 'normal' | 'rare' | 'super_rare'; duplicate: boolean } | null): NobitMood {
  if (!result) return 'excited'
  if (result.duplicate) return 'thanks'
  return result.rarity === 'super_rare' ? 'jump' : result.rarity === 'rare' ? 'joy' : 'happy'
}
