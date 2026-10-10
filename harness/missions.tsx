import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { MissionsView } from '../src/home/Missions'
import type { Mission } from '../src/home/missionModel'

const M = (o: Partial<Mission>): Mission => ({
  id: Math.random().toString(), title: '秋の学習チャレンジ', description: '10月のあいだ、みんなで記録を集めよう。', metric: 'records', startsOn: '2026-10-05', endsOn: '2026-10-18',
  clubGoal: 120, personalGoal: 10, rewardPersonalCoins: 5, rewardClubCoins: 10, status: 'active', participants: 4, clubProgress: 58, personalReached: 1,
  joined: true, myProgress: 6, myPersonalRewarded: false, myClubRewarded: false, ...o,
})
const base = { today: '2026-10-10', error: null, busy: false, onJoin() {}, onTab() {} }
const screens: Record<string, JSX.Element> = {
  joined: <MissionsView {...base} missions={[M({}), M({ title: '9月の記録チャレンジ', status: 'ended', startsOn: '2026-09-01', endsOn: '2026-09-30', clubProgress: 130, myProgress: 4 })]} />,
  notjoined: <MissionsView {...base} missions={[M({ joined: false, myProgress: 0 }), M({ title: '冬のスタート', status: 'upcoming', startsOn: '2026-10-26', endsOn: '2026-11-08', joined: false, myProgress: 0, participants: 0, clubProgress: 0 })]} />,
  empty: <MissionsView {...base} missions={[]} />,
  loading: <MissionsView {...base} missions={null} />,
}
createRoot(document.getElementById('root')!).render(<div className="shell">{screens[location.hash.slice(1)]}</div>)
