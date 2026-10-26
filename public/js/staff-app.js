// =============================================================================
// 職員の画面の土台（工程5-1・5-2）：左のメニュー・画面の切り替え・ホーム
//
// 画面の形（仕様書 6章）:
//   上     クラブ名・ログインしている人（「事務担当」「高橋コーチ」など）・ログアウト
//   左     メニュー。役割（事務担当／コーチ）ごとに出す項目が違い、閉じている機能（clubs.config.features）の項目は出さない。
//          幅が狭い画面（スマホ）では、上に横並び（横にすべらせる）
//   中     選んだ画面。まだ作っていない画面は「準備中」
//   事務担当のホーム … やること（入会承認待ち・来月分の開講・出欠未入力）。押すとその画面へ
//   コーチのホーム   … 今日の担当クラスと、担当クラスの出欠未入力
//   入会承認（#/approvals）と紙の申込書からの登録（#/approvals/paper）は js/staff-admission.js（工程5-4・5-5）
//   会員名簿（#/members）は js/staff-roster.js（工程5-6）、設定（#/settings）は js/staff-settings.js（工程5-8）
//   LINEアプリの中で開いたときだけ、メニューの下に「閉じる」を出す
//
// データ:
//   ログインしたときの supabase クライアントで読む（RLS に任せる。管理用キーは使わない）。
//   やることは staff_todo()（012_staff_home.sql）を1回呼ぶだけ。呼んだ人の権限で数えられる。
// =============================================================================
import { featureOn } from './config.js';
import { esc } from './form-check.js';
import { todayJST } from './grade.js';

// --- 小さな道具 -----------------------------------------------------------------
const WEEKDAYS = '日月火水木金土';
function fmtDate(iso) {                       // '2026-11-05' → '11月5日（木）'
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}
const fmtMonth = (iso) => `${Number(iso.slice(5, 7))}月`;   // '2026-11-01' → '11月'
const fmtTime = (t) => String(t).slice(0, 5).replace(/^0/, '');   // '09:30:00' → '9:30'

// --- メニュー ------------------------------------------------------------------
//   key     … URL（#/key）
//   roles   … 出す役割
//   feature … この機能が閉じていれば出さない（なければ常に出す）
//   step    … まだ作っていない画面は、作る工程を「準備中」に添える（作った画面には付けない）
const MENU = [
  { key: 'home',      label: 'ホーム',                   roles: ['admin', 'coach'] },
  // 事務担当
  { key: 'approvals', label: '入会承認',                 roles: ['admin'] },
  { key: 'sessions',  label: '開講情報',                 roles: ['admin'], feature: 'schedule', step: '工程6-1〜6-5' },
  { key: 'shifts',    label: 'シフト確定',               roles: ['admin'], feature: 'shifts', step: '工程6-7' },
  { key: 'members',   label: '会員名簿',                 roles: ['admin'] },
  { key: 'fees',      label: '月謝チェックリスト',       roles: ['admin'], feature: 'fees', step: '工程8-4' },
  { key: 'notices',   label: 'お知らせ',                 roles: ['admin'], feature: 'notices', step: '工程11' },
  { key: 'excel',     label: 'Excel取り込み・書き出し',  roles: ['admin'], step: '工程5-11〜5-13' },
  { key: 'settings',  label: '設定',                     roles: ['admin'] },
  // コーチ
  { key: 'attendance', label: '出席の記録',              roles: ['coach'], feature: 'attendance', step: '工程7-2' },
  { key: 'wishes',     label: 'シフト希望',              roles: ['coach'], feature: 'shifts', step: '工程6-6' },
  { key: 'feedback',   label: 'フィードバック',          roles: ['coach'], feature: 'feedback', step: '工程9-1' },
  { key: 'handover',   label: '引き継ぎメモ',            roles: ['coach'], feature: 'feedback', step: '工程9-2' },
  { key: 'tags',       label: '級の付け替え',            roles: ['coach'], feature: 'tags', step: '工程5-7' },
];

// この人に出すメニュー（役割と、開いている機能で絞る）
export function menuFor(role, config) {
  return MENU.filter((m) => m.roles.includes(role) && (!m.feature || featureOn(config, m.feature)));
}

// =============================================================================
// 事務担当のホーム：やること
//   todo … staff_todo() の戻り値
//   on   … 開いている機能
// =============================================================================
export function adminTodoHtml(todo, on) {
  const rows = [];

  // 入会承認待ち（いつも出す）
  const pending = todo.pending_members;
  rows.push(todoRow('#/approvals', '入会承認待ち', pending > 0 ? `${pending}人` : 'なし', pending > 0,
    pending > 0 ? '承認すると会員番号が決まり、保護者の画面に予定が出ます。' : ''));

  // 来月分の開講（予定の機能が開いているとき）
  if (on.schedule) {
    const month = fmtMonth(todo.next_month);
    rows.push(todo.next_month_confirmed
      ? todoRow('#/sessions', `${month}分の開講`, '確定済み', false, '')
      : todoRow('#/sessions', `${month}分の開講`, '未確定', true,
        todo.next_month_expected_on ? `${fmtDate(todo.next_month_expected_on)}ごろ確定の予定です。` : '確定の予定日はまだ決まっていません。'));
  }

  // 出欠未入力（出席記録の機能が開いているとき）
  if (on.attendance) rows.push(missingRow(todo, '#/sessions'));

  const busy = rows.filter((r) => r.busy).length;
  return `
    <section class="s-card" aria-labelledby="s-todo">
      <h2 id="s-todo">やること</h2>
      <p class="small">${busy > 0 ? `${busy}つあります。押すと、その画面に移ります。` : 'いま、やることはありません。'}</p>
      <ul class="s-todo">${rows.map((r) => r.html).join('')}</ul>
    </section>`;
}

// やることの1行（押すとその画面へ）。busy は「やることがある」印
function todoRow(href, label, value, busy, note, extra = '') {
  return {
    busy,
    html: `
      <li>
        <a class="s-todo-row${busy ? ' is-busy' : ''}" href="${href}">
          <span class="s-todo-label">${esc(label)}</span>
          <span class="s-todo-value">${esc(value)}</span>
          ${note ? `<span class="s-todo-note">${esc(note)}</span>` : ''}
          ${extra}
        </a>
      </li>`,
  };
}

// 出欠未入力の行（直近の回を5つまで添える）
function missingRow(todo, href) {
  const n = todo.attendance_missing;
  const list = (todo.attendance_missing_list ?? []).map((s) =>
    `<li>${esc(fmtDate(s.session_date))} ${esc(fmtTime(s.start_time))} ${esc(s.class_name)}</li>`).join('');
  return todoRow(href, '出欠の未入力', n > 0 ? `${n}回` : 'なし', n > 0,
    n > 0 ? '過去31日の、終わった回で、出欠が1人分も入っていない回です。' : '',
    list ? `<ul class="s-todo-list">${list}</ul>${n > 5 ? `<span class="s-todo-note">ほか${n - 5}回</span>` : ''}` : '');
}

// =============================================================================
// コーチのホーム：今日の担当クラス
//   sessions … 今日の回（担当クラスの分。申込中は除く）
//   classes  … id → クラス名
// =============================================================================
export function coachTodayHtml(sessions, classNames, hasAssignments) {
  let body;
  if (!hasAssignments) {
    body = '<p>担当のクラスがまだ登録されていません。事務担当にお知らせください。</p>';
  } else if (sessions.length === 0) {
    body = '<p>今日の担当クラスはありません。</p>';
  } else {
    body = `<ul class="s-list">${sessions.map((s) => `
      <li class="s-row${s.status === 'cancelled' ? ' is-cancelled' : ''}">
        <span class="s-row-time">${esc(fmtTime(s.start_time))}〜${esc(fmtTime(s.end_time))}</span>
        <span class="s-row-main">${esc(classNames.get(s.class_id) ?? '')}<span class="s-row-sub">${esc(s.venue)}</span></span>
        ${s.status === 'cancelled' ? '<span class="s-tag is-warn">中止</span>'
          : s.status === 'venue_changed' ? '<span class="s-tag is-warn">会場変更</span>' : ''}
        ${s.change_note ? `<span class="s-row-note">${esc(s.change_note)}</span>` : ''}
      </li>`).join('')}</ul>`;
  }
  return `
    <section class="s-card" aria-labelledby="s-today">
      <h2 id="s-today">今日の担当クラス</h2>
      <p class="small">${esc(fmtDate(todayJST()))}</p>
      ${body}
    </section>`;
}

// =============================================================================
// 職員の画面を出す
//   club    … config.js のクラブ（key・name）
//   login   … auth-line.js の signIn の戻り値（supabase・role）
//   show    … 画面全体を差し替える関数
//   signOut … ログアウト
// =============================================================================
export async function renderStaffApp(club, login, show, signOut) {
  const supabase = login.supabase;
  const role = login.role;
  show('<p class="loading">読み込んでいます…</p>');

  // --- 最初に読むもの：クラブの設定（機能の開け閉め）と、自分の表示名 --------------------
  const userId = (await supabase.auth.getSession()).data?.session?.user?.id ?? null;
  const [clubRes, meRes] = await Promise.all([
    supabase.from('clubs').select('config').maybeSingle(),
    supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(),
  ]).catch(() => [{ error: true }, { error: true }]);
  if (clubRes.error || meRes.error) {
    show(`<div class="notice"><h1>読み込めませんでした</h1>
      <p>通信の状態を確かめて、もう一度開いてください。</p>
      <p class="auth-actions"><button type="button" id="s-retry">もう一度読み込む</button></p></div>`);
    document.getElementById('s-retry').addEventListener('click', () => location.reload());
    return;
  }
  const config = clubRes.data?.config ?? {};
  const on = Object.fromEntries(['schedule', 'attendance', 'notices', 'fees', 'makeup', 'tags', 'shifts', 'feedback']
    .map((name) => [name, featureOn(config, name)]));
  const menu = menuFor(role, config);
  const roleLabel = role === 'admin' ? '事務担当' : 'コーチ';
  const who = meRes.data?.display_name ? `${meRes.data.display_name}（${roleLabel}）` : roleLabel;
  const inLineApp = typeof liff !== 'undefined' && liff.isInClient();

  // --- 枠（上・左のメニュー・中身）は1回だけ作る ---------------------------------------
  show(`
    <div class="staff">
      <header class="s-header">
        <p class="s-club">${esc(club.name)}</p>
        <p class="s-who">${esc(who)}</p>
        <button type="button" class="s-logout" id="s-logout">ログアウト</button>
      </header>
      <nav class="s-nav" aria-label="メニュー">
        <ul id="s-menu">${menu.map((m) => `<li><a href="#/${m.key}" data-key="${m.key}">${esc(m.label)}</a></li>`).join('')}</ul>
        ${inLineApp ? '<button type="button" class="s-close" id="s-close">閉じる（LINEに戻る）</button>' : ''}
      </nav>
      <main class="s-main" id="s-view" tabindex="-1"></main>
    </div>`);
  document.getElementById('s-logout').addEventListener('click', async () => {
    await signOut(supabase);
    location.replace(location.pathname);
  });
  document.getElementById('s-close')?.addEventListener('click', () => liff.closeWindow());

  const view = document.getElementById('s-view');
  let routeNo = 0;   // 描くたびに増やす。読み込み中に別の画面へ移ったら、古い読み込みは描かない
  let firstRoute = true;

  // --- ホーム -----------------------------------------------------------------------
  const drawHome = async (stillHere) => {
    view.innerHTML = '<section class="s-card"><p class="small">読み込んでいます…</p></section>';
    const today = todayJST();
    const jobs = [supabase.rpc('staff_todo')];
    if (role === 'coach') {
      jobs.push(
        supabase.from('coach_assignments').select('class_id').eq('coach_user_id', userId),
        supabase.from('classes').select('id, name'),
        supabase.from('sessions').select('id, class_id, start_time, end_time, venue, status, change_note')
          .eq('session_date', today).neq('status', 'applying').order('start_time'),
      );
    }
    const res = await Promise.all(jobs).catch(() => jobs.map(() => ({ error: true })));
    if (!stillHere()) return;
    if (res.some((r) => r.error)) {
      view.innerHTML = `<section class="s-card"><p>読み込めませんでした。</p>
        <button type="button" class="s-button secondary" id="s-home-retry">もう一度読み込む</button></section>`;
      document.getElementById('s-home-retry').addEventListener('click', () => drawHome(stillHere));
      return;
    }
    const todo = res[0].data;
    if (role === 'admin') {
      view.innerHTML = adminTodoHtml(todo, on);
      return;
    }
    // コーチ：担当クラスの今日の回と、担当クラスの出欠未入力
    const mine = new Set((res[1].data ?? []).map((a) => a.class_id));
    const classNames = new Map((res[2].data ?? []).map((c) => [c.id, c.name]));
    const sessions = (res[3].data ?? []).filter((s) => mine.has(s.class_id));
    const missing = on.attendance && todo.attendance_missing > 0
      ? `<section class="s-card" aria-labelledby="s-missing"><h2 id="s-missing">やること</h2>
           <ul class="s-todo">${missingRow(todo, '#/attendance').html}</ul></section>`
      : '';
    view.innerHTML = coachTodayHtml(sessions, classNames, mine.size > 0) + missing;
  };

  // --- 画面の切り替え -----------------------------------------------------------------
  const route = () => {
    const [, key = 'home', sub] = location.hash.match(/^#\/(\w+)(?:\/([\w-]+))?/) || [];
    const myNo = ++routeNo;
    const stillHere = () => myNo === routeNo;
    // メニューにない画面（権限がない・機能が閉じている・知らない URL）はホームに戻す
    const item = menu.find((m) => m.key === key) ?? menu[0];

    for (const a of document.querySelectorAll('#s-menu a')) {
      if (a.dataset.key === item.key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    if (item.key === 'home') {
      drawHome(stillHere);
    } else if (item.key === 'approvals') {
      // 入会承認（#/approvals）・紙の申込書から登録（#/approvals/paper）
      import('./staff-admission.js').then(({ renderApprovals, renderPaperForm }) => {
        if (!stillHere()) return;
        if (sub === 'paper') renderPaperForm(view, { supabase, stillHere });
        else renderApprovals(view, { supabase, stillHere });
      });
    } else if (item.key === 'members') {
      import('./staff-roster.js').then(({ renderRoster }) => {
        if (stillHere()) renderRoster(view, { supabase, stillHere });
      });
    } else if (item.key === 'settings') {
      import('./staff-settings.js').then(({ renderSettings }) => {
        if (stillHere()) renderSettings(view, { supabase, stillHere });
      });
    } else {
      view.innerHTML = `<section class="s-card"><h2>${esc(item.label)}</h2><p>準備中です。</p>
        <p class="small">（${esc(item.step)}で作ります）</p>
        <a href="#/home" class="s-button secondary">ホームに戻る</a></section>`;
    }
    // メニューで移ったときは、読み上げソフト・キーボードの位置を中身の先頭へ（開いた直後は動かさない）
    if (!firstRoute) view.focus({ preventScroll: true });
    firstRoute = false;
  };
  addEventListener('hashchange', route);
  route();
}
