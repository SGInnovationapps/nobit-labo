// 保護者同意の文面。閲覧範囲の「版」ごとに持つ。
// 範囲を変えるときは、consent_scope_versions に新しい版を足し、ここにも同じ版の文面を足す。
// （文面のない版は、DB の summary をそのまま表示する）

export type ConsentSection = { heading: string; body: string }

export const CONSENT_TEXT: Record<number, ConsentSection[]> = {
  1: [
    {
      heading: '記録されること',
      body: '完了したタスクと、その完了時刻。日ごとに完了した数（記録の帯）。生徒が自由に登録したタスクも、本人の記録として保存されます。',
    },
    {
      heading: 'クラブの管理者が見られること',
      body: '完了したタスクと、記録の帯まで。生徒が自由に登録した内容は、クラブの管理者には見えません。',
    },
    {
      heading: 'NOBIT! 運営が見られること',
      body: 'NOBIT! の運営は、サービスを運営するために、生徒が自由に登録した内容を含む記録を見ることがあります。',
    },
    {
      heading: '公式LINE からの連絡',
      body: 'NOBIT! 公式LINE から、学習に関する連絡が届くことがあります。運営が手作業で送る場合と、今後、自動で送る場合があります。',
    },
  ],
}
