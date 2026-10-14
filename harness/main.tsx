import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import { Shell } from '../src/screens/Shell'
import { Notice } from '../src/screens/Notice'
import { ConsentStep } from '../src/screens/ConsentStep'
import { ProfileStep } from '../src/screens/ProfileStep'

const scope = { version: 1, summary: 's' }
const noop = () => undefined
const which = location.hash.slice(1)
const screens: Record<string, React.ReactNode> = {
  consent: (
    <Shell progress={1}>
      <ConsentStep clubName="［クラブ名］" scope={scope} reconsent={false} busy={false} error={null} onSubmit={noop} />
    </Shell>
  ),
  consent_error: (
    <Shell progress={1}>
      <ConsentStep clubName="［クラブ名］" scope={scope} reconsent={false} busy={false} error="保存できませんでした。通信を確認して、もう一度お試しください。" onSubmit={noop} />
    </Shell>
  ),
  profile: (
    <Shell progress={2}>
      <ProfileStep initialName="" initialGrade={null} busy={false} error={null} onSubmit={noop} />
    </Shell>
  ),
  profile_line: (
    <Shell progress={2}>
      <ProfileStep initialName="のびた" nameFromLine initialGrade={null} busy={false} error={null} onSubmit={noop} />
    </Shell>
  ),
  profile_filled: (
    <Shell progress={2}>
      <ProfileStep initialName="ノビ太" initialGrade={8} busy={false} error={null} onSubmit={noop} />
    </Shell>
  ),
  waiting: (
    <Shell progress={3}>
      <Notice status="承認待ち" title="クラブの管理者の確認を待っています" action={{ label: '状態を更新する', onClick: noop }}>
        <p>［クラブ名］の管理者が確認すると、NOBIT! が使えるようになります。</p>
        <dl className="facts" style={{ marginTop: 20 }}><dt>表示名</dt><dd>ノビ太</dd><dt>学年</dt><dd>中2</dd></dl>
      </Notice>
    </Shell>
  ),
  need_invite: (
    <Shell progress={null}>
      <Notice title="招待リンクから開いてください">
        <p className="copy-main">きょうのキミが、明日のキミを育てる。</p>
        <p>NOBIT! は、クラブから届いた招待のQRコードまたはリンクから始めます。クラブの管理者に、もう一度確認してください。</p>
      </Notice>
    </Shell>
  ),
}
createRoot(document.getElementById('root')!).render(screens[which] ?? <p>unknown</p>)
