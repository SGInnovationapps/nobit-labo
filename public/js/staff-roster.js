// =============================================================================
// 会員名簿（工程5-6）。事務担当の画面（#/members）
//
// 画面の形:
//   上   絞り込み（クラス・状態・名前やふりがな・番号で探す）と並べ方（ふりがな・会員番号・学年）。人数
//   一覧 1行が1人：会員番号・名前（ふりがな）・学年と年齢・クラス・印（LINEなし／規約の同意待ち）
//        押すと詳しく：生年月日・申込日・承認日・退会日・保護者のLINE・規約の同意・配慮の印・緊急連絡先
//   緊急連絡先は「表示する」を押したときだけ読む（読むたびに記録が残る関数のため）
//
// データ:
//   staff_roster（014_roster_settings.sql）を読む。学年・年齢はデータベースの関数で計算した値をそのまま出す
//   （画面で計算し直さない。仕様書 4-1-1）。ほかに、クラス（絞り込みの選択肢）と規約のいちばん新しい版。
// =============================================================================
import { esc, katakanaToHiragana } from './form-check.js';

const fmtNo = (n) => String(n).padStart(4, '0');
function fmtDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${y}年${m}月${d}日`;
}
const fmtTs = (ts) => new Date(ts).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' });

// 探す文字をそろえる（全角・カタカナ・空白の違いをなくす）
const norm = (s) => katakanaToHiragana(String(s ?? '').normalize('NFKC')).replace(/\s+/g, '').toLowerCase();

// 絞り込みと並べ替え（画面の外からも試せるように export）
//   rows … staff_roster の行、f … { classId, status, q, sort }
export function filterRoster(rows, f) {
  const q = norm(f.q);
  const list = rows.filter((r) => {
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.classId === 'none' && r.class_id) return false;
    if (f.classId && f.classId !== 'none' && r.class_id !== f.classId) return false;
    if (q) {
      const hay = norm(`${r.family_name}${r.given_name} ${r.family_kana}${r.given_kana} ${r.member_no ?? ''} ${r.member_no ? fmtNo(r.member_no) : ''}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const kana = (r) => `${r.family_kana} ${r.given_kana}`;
  const by = {
    kana: (a, b) => kana(a).localeCompare(kana(b), 'ja'),
    no: (a, b) => (a.member_no ?? 1e9) - (b.member_no ?? 1e9) || kana(a).localeCompare(kana(b), 'ja'),
    grade: (a, b) => b.grade_no - a.grade_no || kana(a).localeCompare(kana(b), 'ja'),
  }[f.sort] ?? (() => 0);
  return list.sort(by);
}

// 規約の同意が、いちばん新しい版に追いついていないか（在籍中・申込中の子だけ見る）
export const needsConsent = (r, latestVersion) =>
  latestVersion != null && r.status !== 'withdrawn' && (r.consent_version ?? 0) < latestVersion;

// =============================================================================
// 名簿を出す
//   container … 画面を入れる要素
//   supabase  … ログインしたときのクライアント
//   stillHere … まだこの画面を見ているか
// =============================================================================
export function renderRoster(container, { supabase, stillHere }) {
  const box = document.createElement('div');
  box.className = 'sr';
  container.replaceChildren(box);
  const f = { classId: '', status: 'active', q: '', sort: 'kana' };
  let rows = [];
  let classes = [];
  let latest = null;            // 規約のいちばん新しい版の番号
  let openId = null;            // 詳しくを開いている子
  const ec = new Map();         // 子 → { busy, data, error }（緊急連絡先）

  const load = async () => {
    box.innerHTML = '<section class="s-card"><p class="small">読み込んでいます…</p></section>';
    const res = await Promise.all([
      supabase.from('staff_roster').select('*'),
      supabase.from('classes').select('id, name, sort_order, is_active').order('sort_order').order('name'),
      supabase.from('terms_versions').select('version').order('version', { ascending: false }).limit(1),
    ]).catch(() => [{ error: true }]);
    if (!stillHere()) return;
    if (res.some((r) => r.error)) {
      box.innerHTML = `<section class="s-card"><p>読み込めませんでした。</p>
        <button type="button" class="s-button secondary" data-act="reload">もう一度読み込む</button></section>`;
      return;
    }
    rows = res[0].data ?? [];
    classes = res[1].data ?? [];
    latest = res[2].data?.[0]?.version ?? null;
    drawAll();
  };

  // --- 上（絞り込み）は1回だけ描き、入力中に作り直さない。一覧だけを描き直す -----------------
  const drawAll = () => {
    const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    box.innerHTML = `
      <section class="s-card" aria-labelledby="sr-title">
        <h2 id="sr-title">会員名簿</h2>
        <form class="sr-filters" role="search" aria-label="名簿の絞り込み">
          <label><span>クラス</span><select name="classId">
            ${opt('', 'すべてのクラス', f.classId)}
            ${classes.map((c) => opt(c.id, c.is_active ? c.name : `${c.name}（使っていない）`, f.classId)).join('')}
            ${opt('none', 'クラスなし（申込中）', f.classId)}
          </select></label>
          <label><span>状態</span><select name="status">
            ${opt('active', '在籍中', f.status)}${opt('pending', '申込中', f.status)}${opt('withdrawn', '退会', f.status)}${opt('all', 'すべて', f.status)}
          </select></label>
          <label><span>並べ方</span><select name="sort">
            ${opt('kana', 'ふりがな順', f.sort)}${opt('no', '会員番号順', f.sort)}${opt('grade', '学年順（上から）', f.sort)}
          </select></label>
          <label class="sr-q"><span>探す</span><input type="search" name="q" value="${esc(f.q)}" placeholder="名前・ふりがな・会員番号" autocomplete="off"></label>
        </form>
        <p class="small" id="sr-count" aria-live="polite"></p>
      </section>
      <section class="s-card sr-list-card" aria-label="会員の一覧"><ul class="sr-list" id="sr-list"></ul></section>`;
    drawList();
  };

  const tags = (r) => {
    const t = [];
    if (r.status === 'pending') t.push('<span class="s-tag">申込中</span>');
    if (r.status === 'withdrawn') t.push('<span class="s-tag">退会</span>');
    if (r.status === 'active' && r.guardian_count === 0) t.push('<span class="s-tag">LINEなし</span>');
    if (needsConsent(r, latest)) t.push('<span class="s-tag is-warn">規約の同意待ち</span>');
    if (r.care_flag) t.push('<span class="s-tag">配慮あり</span>');
    return t.join('');
  };

  const detail = (r) => {
    const e = ec.get(r.member_id) ?? {};
    const ecHtml = e.data !== undefined
      ? (e.data ? `<dl class="pf-dl">
            <dt>1件目</dt><dd>${esc(e.data.ec1_name)}（${esc(e.data.ec1_relation)}）<br>${esc(e.data.ec1_phone)}</dd>
            ${e.data.ec2_name ? `<dt>2件目</dt><dd>${esc(e.data.ec2_name)}（${esc(e.data.ec2_relation)}）<br>${esc(e.data.ec2_phone)}</dd>` : ''}
          </dl>` : '<p>緊急連絡先は登録されていません。</p>')
      : `${e.error ? `<p class="af-notice" role="alert">${esc(e.error)}</p>` : ''}
         <button type="button" class="s-button secondary" data-act="reveal" ${e.busy ? 'disabled' : ''}>${e.busy ? '読み込んでいます…' : '緊急連絡先を表示する'}</button>
         <p class="small">表示すると、だれがいつ見たかの記録が残ります。</p>`;
    const consent = r.consent_version
      ? `第${esc(r.consent_version)}版に同意（${r.consent_method === 'paper' ? '紙' : 'アプリ'}）${needsConsent(r, latest) ? `。いちばん新しい第${esc(latest)}版にはまだ同意していません` : ''}`
      : '同意の記録がありません';
    return `
      <div class="sr-detail" id="sr-d-${esc(r.member_id)}">
        <dl class="pf-dl">
          <dt>生年月日</dt><dd>${esc(fmtDate(r.birth_date))}（${esc(r.grade)}・${esc(r.age)}歳）</dd>
          <dt>申込日</dt><dd>${esc(fmtTs(r.applied_at))}</dd>
          ${r.approved_at ? `<dt>承認日</dt><dd>${esc(fmtTs(r.approved_at))}</dd>` : ''}
          ${r.withdrawn_on ? `<dt>退会日</dt><dd>${esc(fmtDate(r.withdrawn_on))}</dd>` : ''}
          <dt>保護者のLINE</dt><dd>${r.guardian_count > 0 ? `${esc(r.guardian_count)}人がつながっています` : 'つながっていません（LINEを使わない家庭など）'}</dd>
          <dt>会員規約</dt><dd>${consent}</dd>
          <dt>配慮の印</dt><dd>${r.care_flag ? 'あり（中身は紙で確かめる）' : 'なし'}</dd>
        </dl>
        <h3>緊急連絡先</h3>
        ${ecHtml}
      </div>`;
  };

  const drawList = () => {
    const list = filterRoster(rows, f);
    const total = rows.filter((r) => r.status === 'active').length;
    box.querySelector('#sr-count').textContent = `在籍中 ${total}人・この条件で ${list.length}人`;
    box.querySelector('#sr-list').innerHTML = list.length === 0
      ? '<li class="sr-empty">この条件の会員はいません。</li>'
      : list.map((r) => `
        <li class="sr-item${openId === r.member_id ? ' is-open' : ''}" data-id="${esc(r.member_id)}">
          <button type="button" class="sr-row" data-act="toggle" aria-expanded="${openId === r.member_id}" aria-controls="sr-d-${esc(r.member_id)}">
            <span class="sr-no">${r.member_no ? fmtNo(r.member_no) : '----'}</span>
            <span class="sr-name">${esc(r.family_name)} ${esc(r.given_name)}<span class="sr-kana">${esc(r.family_kana)} ${esc(r.given_kana)}</span></span>
            <span class="sr-grade">${esc(r.grade)}・${esc(r.age)}歳</span>
            <span class="sr-class">${r.class_name ? esc(r.class_name) : '—'}</span>
            <span class="sr-tags">${tags(r)}</span>
          </button>
          ${openId === r.member_id ? detail(r) : ''}
        </li>`).join('');
  };

  const reveal = async (r) => {
    ec.set(r.member_id, { busy: true });
    drawList();
    const { data, error } = await supabase.rpc('reveal_emergency_contacts', { p_member_id: r.member_id });
    if (!stillHere()) return;
    ec.set(r.member_id, error ? { error: '読み込めませんでした。もう一度押してください。' } : { data: data?.[0] ?? null });
    drawList();
  };

  box.addEventListener('input', (e) => {
    if (e.target.name === 'q') { f.q = e.target.value; drawList(); }
  });
  box.addEventListener('change', (e) => {
    if (['classId', 'status', 'sort'].includes(e.target.name)) { f[e.target.name] = e.target.value; drawList(); }
  });
  box.addEventListener('submit', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reload') { load(); return; }
    const id = e.target.closest('[data-id]')?.dataset.id;
    const r = rows.find((x) => x.member_id === id);
    if (!r) return;
    if (act === 'toggle') {
      openId = openId === id ? null : id;
      drawList();
      box.querySelector(`[data-id="${CSS.escape(id)}"] .sr-row`)?.focus();
    } else if (act === 'reveal' && !ec.get(id)?.busy) reveal(r);
  });
  load();
}
