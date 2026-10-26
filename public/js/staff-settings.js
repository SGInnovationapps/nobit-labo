// =============================================================================
// 設定：クラスと会員規約（工程5-8）。事務担当の画面（#/settings）
//
// クラス:
//   一覧（並び順）：名前・対象学年・定員・1回に要るコーチの人数・在籍の人数・使う／使わない。
//   「クラスを追加」「変更」で同じ入力欄を出す。クラスは消さない（過去の開講日・出欠が指しているため）。
//   使わなくなったら「使わない」にする（承認・紙の登録で選べなくなる。今いる子はそのまま）。
//   classes に直接書く（007_rls.sql の許可。決まりはテーブルの検査が効く）。
//
// 会員規約:
//   いまの版（第○版・公開日）と本文。「改定する」で本文を直して公開すると、版が1つ上がる（publish_terms、014）。
//   公開する前に、保護者が次に開いたとき同意し直す画面が出ることを知らせ、もう一度押してもらう。
//   前の版は消えず、同意の記録も残る。
// =============================================================================
import { esc } from './form-check.js';
import { gradeLabel } from './grade.js';

const GRADES = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];   // 001 の classes の範囲と同じ
const fmtTs = (ts) => new Date(ts).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' });
const MAX_TERMS = 20000;

// 対象学年の表示（「小1〜小3」「年長まで」「制限なし」）
export function gradeRange(min, max) {
  if (min == null && max == null) return '制限なし';
  if (min != null && max != null) return min === max ? gradeLabel(min) : `${gradeLabel(min)}〜${gradeLabel(max)}`;
  return min != null ? `${gradeLabel(min)}から` : `${gradeLabel(max)}まで`;
}

// クラスの入力を確かめる。[そろえた値, エラー] を返す
export function checkClass(v, classes, editingId) {
  const e = {};
  const name = String(v.name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name) e.name = 'クラスの名前を入れてください';
  else if (name.length > 30) e.name = 'クラスの名前は30文字までです';
  else if (classes.some((c) => c.id !== editingId && c.name === name)) e.name = '同じ名前のクラスがすでにあります';
  const num = (s) => (String(s ?? '').trim() === '' ? null : Number(String(s).normalize('NFKC')));
  const gmin = v.grade_min === '' || v.grade_min == null ? null : Number(v.grade_min);
  const gmax = v.grade_max === '' || v.grade_max == null ? null : Number(v.grade_max);
  if (gmin != null && gmax != null && gmin > gmax) e.grade = '対象学年の「から」と「まで」が逆です';
  const capacity = num(v.capacity);
  if (capacity != null && !(Number.isInteger(capacity) && capacity >= 1 && capacity <= 999)) e.capacity = '定員は1〜999の数で入れてください（空なら制限なし）';
  const coaches = num(v.required_coaches) ?? 1;
  if (!(Number.isInteger(coaches) && coaches >= 0 && coaches <= 20)) e.required_coaches = '0〜20の数で入れてください';
  const order = num(v.sort_order) ?? 0;
  if (!(Number.isInteger(order) && order >= 0 && order <= 999)) e.sort_order = '0〜999の数で入れてください';
  return [{ name, grade_min: gmin, grade_max: gmax, capacity, required_coaches: coaches, sort_order: order, is_active: v.is_active !== false }, e];
}

// =============================================================================
// 設定を出す
//   container … 画面を入れる要素
//   supabase  … ログインしたときのクライアント
//   stillHere … まだこの画面を見ているか
// =============================================================================
export function renderSettings(container, { supabase, stillHere }) {
  const box = document.createElement('div');
  box.className = 'st';
  container.replaceChildren(box);
  let classes = [];
  let counts = new Map();        // クラス → 在籍中の人数
  let terms = [];                // 規約の版（新しい順）
  let clubId = null;
  // クラスの入力欄（null なら閉じている。id が空なら追加）
  let form = null;
  let formErrors = {};
  let classNotice = { text: '', ok: false };
  let classBusy = false;
  // 規約
  let showBody = false;
  let editing = false;           // 改定の入力中
  let draft = '';
  let confirming = false;        // 「公開しますか」を出している
  let termsNotice = { text: '', ok: false };
  let termsBusy = false;

  const load = async () => {
    box.innerHTML = '<section class="s-card"><p class="small">読み込んでいます…</p></section>';
    const res = await Promise.all([
      supabase.from('classes').select('id, club_id, name, grade_min, grade_max, capacity, required_coaches, sort_order, is_active')
        .order('sort_order').order('name'),
      supabase.from('members').select('class_id').eq('status', 'active'),
      supabase.from('terms_versions').select('id, version, body, published_at').order('version', { ascending: false }),
      supabase.from('clubs').select('id').maybeSingle(),
    ]).catch(() => [{ error: true }]);
    if (!stillHere()) return;
    if (res.some((r) => r.error)) {
      box.innerHTML = `<section class="s-card"><p>読み込めませんでした。</p>
        <button type="button" class="s-button secondary" data-act="reload">もう一度読み込む</button></section>`;
      return;
    }
    classes = res[0].data ?? [];
    counts = new Map();
    for (const m of res[1].data ?? []) counts.set(m.class_id, (counts.get(m.class_id) ?? 0) + 1);
    terms = res[2].data ?? [];
    clubId = res[3].data?.id ?? null;
    draw();
  };

  // --- クラス ---------------------------------------------------------------------------
  const gradeSelect = (name, value, label) => `
    <label class="st-grade"><span>${label}</span>
      <select name="${name}" ${formErrors.grade ? 'aria-invalid="true"' : ''}>
        <option value="">${name === 'grade_min' ? '下はなし' : '上はなし'}</option>
        ${GRADES.map((g) => `<option value="${g}" ${value === g ? 'selected' : ''}>${esc(gradeLabel(g))}</option>`).join('')}
      </select></label>`;
  const input = (name, label, value, attrs = '', hint = '') => `
    <div class="af-field">
      <label for="st-${name}">${label}</label>
      <input id="st-${name}" name="${name}" value="${esc(value ?? '')}" ${formErrors[name] ? 'aria-invalid="true"' : ''} ${attrs}>
      ${hint ? `<p class="small">${hint}</p>` : ''}
      ${formErrors[name] ? `<p class="af-err">${esc(formErrors[name])}</p>` : ''}
    </div>`;

  const classForm = () => {
    const v = form;
    const n = v.id ? counts.get(v.id) ?? 0 : 0;
    return `
      <form class="af-card st-form" data-form="class" novalidate aria-labelledby="st-form-title">
        <h3 id="st-form-title">${v.id ? `「${esc(v.original)}」を変更` : 'クラスを追加'}</h3>
        ${input('name', 'クラスの名前', v.name, 'maxlength="40" autocomplete="off"')}
        <div class="af-field">
          <span class="af-label">対象学年（承認・紙の登録のとき、合うクラスを先に選んでおくのに使う）</span>
          <div class="st-grades">${gradeSelect('grade_min', v.grade_min, 'から')}${gradeSelect('grade_max', v.grade_max, 'まで')}</div>
          ${formErrors.grade ? `<p class="af-err">${esc(formErrors.grade)}</p>` : ''}
        </div>
        <div class="af-two">
          ${input('capacity', '定員（人）', v.capacity, 'inputmode="numeric"', '空なら制限なし')}
          ${input('required_coaches', '1回に要るコーチ（人）', v.required_coaches, 'inputmode="numeric"')}
        </div>
        ${input('sort_order', '並び順（小さいほど上）', v.sort_order, 'inputmode="numeric"')}
        <label class="af-check"><input type="checkbox" name="is_active" ${v.is_active ? 'checked' : ''}> このクラスを使う</label>
        ${v.id && !v.is_active && n > 0 ? `<p class="sa-warn">このクラスには在籍中の子が${n}人います。使わないにしても、今いる子はこのクラスのままです（承認・紙の登録で選べなくなるだけです）。</p>` : ''}
        <div class="sa-actions">
          <button type="submit" class="s-button" ${classBusy ? 'disabled' : ''}>${classBusy ? '保存しています…' : '保存する'}</button>
          <button type="button" class="s-button secondary" data-act="class-cancel" ${classBusy ? 'disabled' : ''}>やめる</button>
        </div>
      </form>`;
  };

  const classSection = () => `
    <section class="s-card" aria-labelledby="st-classes">
      <h2 id="st-classes">クラス</h2>
      <p class="small">クラスは消せません（前の開講日・出欠が残っているため）。使わなくなったクラスは「使わない」にします。</p>
      ${classNotice.text ? `<p class="${classNotice.ok ? 'pf-ok' : 'af-notice'}" role="status">${esc(classNotice.text)}</p>` : ''}
      ${form && !form.id ? classForm() : `<button type="button" class="s-button secondary" data-act="class-add" ${form ? 'disabled' : ''}>クラスを追加</button>`}
      ${classes.length === 0 ? '<p>クラスはまだありません。</p>' : `
      <ul class="st-classes">${classes.map((c) => `
        <li class="st-class${c.is_active ? '' : ' is-off'}" data-id="${esc(c.id)}">
          ${form?.id === c.id ? classForm() : `
          <div class="st-class-main">
            <p class="st-class-name">${esc(c.name)}${c.is_active ? '' : '<span class="s-tag">使っていない</span>'}</p>
            <p class="small">対象学年：${esc(gradeRange(c.grade_min, c.grade_max))}・定員：${c.capacity ? `${esc(c.capacity)}人` : '制限なし'}・コーチ：${esc(c.required_coaches)}人・在籍：${counts.get(c.id) ?? 0}人</p>
          </div>
          <button type="button" class="s-button secondary" data-act="class-edit" ${form ? 'disabled' : ''}>変更</button>`}
        </li>`).join('')}</ul>`}
    </section>`;

  // --- 会員規約 ---------------------------------------------------------------------------
  const termsSection = () => {
    const cur = terms[0];
    const next = (cur?.version ?? 0) + 1;
    let body;
    if (editing) {
      body = `
        <div class="af-field">
          <label for="st-terms-body">${cur ? `改定後の本文（第${next}版になります）` : '本文（第1版になります）'}</label>
          <textarea id="st-terms-body" name="terms_body" rows="14" maxlength="${MAX_TERMS}" ${confirming || termsBusy ? 'readonly' : ''}>${esc(draft)}</textarea>
          <p class="small" id="st-terms-count">${draft.trim().length.toLocaleString()} / ${MAX_TERMS.toLocaleString()}文字</p>
        </div>
        ${confirming ? `
          <div class="sa-confirm" role="group" aria-label="規約の公開">
            <p><strong>第${next}版として公開します。</strong>公開すると、保護者は次にアプリを開いたとき、新しい規約に同意し直す画面が出ます。
              公開は取り消せません（前の版と、これまでの同意の記録は残ります）。</p>
            <div class="sa-actions">
              <button type="button" class="s-button" data-act="terms-publish" ${termsBusy ? 'disabled' : ''}>${termsBusy ? '公開しています…' : `第${next}版として公開する`}</button>
              <button type="button" class="s-button secondary" data-act="terms-back" ${termsBusy ? 'disabled' : ''}>本文に戻る</button>
            </div>
          </div>` : `
          <div class="sa-actions">
            <button type="button" class="s-button" data-act="terms-confirm">内容を確かめて公開へ</button>
            <button type="button" class="s-button secondary" data-act="terms-cancel">やめる</button>
          </div>`}`;
    } else {
      body = cur ? `
        <p>いまの版：<strong>第${esc(cur.version)}版</strong>（${esc(fmtTs(cur.published_at))}に公開）</p>
        <button type="button" class="s-button secondary" data-act="terms-toggle" aria-expanded="${showBody}">${showBody ? '本文を閉じる' : '本文を見る'}</button>
        ${showBody ? `<div class="af-terms" tabindex="0" aria-label="会員規約の本文">${esc(cur.body)}</div>` : ''}
        <button type="button" class="s-button" data-act="terms-edit">改定する</button>
        ${terms.length > 1 ? `<p class="small">これまでの版：${terms.slice(1).map((t) => `第${esc(t.version)}版（${esc(fmtTs(t.published_at))}）`).join('・')}</p>` : ''}`
        : `<p>会員規約がまだありません。規約がないと、保護者は入会を申し込めず、紙の申込書からも登録できません。</p>
           <button type="button" class="s-button" data-act="terms-edit">規約を作る</button>`;
    }
    return `
      <section class="s-card st-terms" aria-labelledby="st-terms">
        <h2 id="st-terms">会員規約</h2>
        ${termsNotice.text ? `<p class="${termsNotice.ok ? 'pf-ok' : 'af-notice'}" role="status">${esc(termsNotice.text)}</p>` : ''}
        ${body}
      </section>`;
  };

  const draw = () => {
    box.innerHTML = classSection() + termsSection();
    const firstBad = box.querySelector('[aria-invalid="true"]');
    if (firstBad) firstBad.focus();
  };

  // --- クラスの保存 -----------------------------------------------------------------------
  const readForm = () => {
    const el = box.querySelector('[data-form="class"]');
    if (!el) return;
    for (const k of ['name', 'capacity', 'required_coaches', 'sort_order']) form[k] = el.elements[k].value;
    for (const k of ['grade_min', 'grade_max']) form[k] = el.elements[k].value === '' ? null : Number(el.elements[k].value);
    form.is_active = el.elements.is_active.checked;
  };
  const saveClass = async () => {
    readForm();
    const [v, e] = checkClass(form, classes, form.id);
    formErrors = e;
    if (Object.keys(e).length) { draw(); return; }
    classBusy = true; draw();
    const q = form.id
      ? supabase.from('classes').update(v).eq('id', form.id).select('id')
      : supabase.from('classes').insert({ ...v, club_id: clubId }).select('id');
    const { data, error } = await q;
    classBusy = false;
    if (!stillHere()) return;
    if (error || !data?.length) {
      classNotice = { text: error?.code === '23505' ? '同じ名前のクラスがすでにあります。' : '保存できませんでした。入力と通信の状態を確かめて、もう一度押してください。', ok: false };
      if (error?.code === '23505') formErrors = { name: '同じ名前のクラスがすでにあります' };
      draw();
      return;
    }
    classNotice = { text: `「${v.name}」を${form.id ? '変更' : '追加'}しました。`, ok: true };
    form = null; formErrors = {};
    await load();
  };

  // --- 規約の公開 -------------------------------------------------------------------------
  const publish = async () => {
    termsBusy = true; draw();
    const { data: r, error } = await supabase.rpc('publish_terms', { p_body: draft });
    termsBusy = false;
    if (!stillHere()) return;
    if (error || !r) { termsNotice = { text: '公開できませんでした。通信の状態を確かめて、もう一度押してください。', ok: false }; draw(); return; }
    if (r.result === 'ok') {
      termsNotice = { text: `第${r.version}版を公開しました。保護者は次にアプリを開いたとき、同意し直す画面が出ます。`, ok: true };
      editing = false; confirming = false; showBody = false;
      await load();
      return;
    }
    termsNotice = {
      text: { unchanged: 'いまの版と同じ本文です。直したいところを書き換えてください。',
              invalid_input: `本文を入れてください（${MAX_TERMS.toLocaleString()}文字まで）。`,
              not_allowed: 'この操作は事務担当だけができます。' }[r.result] ?? '公開できませんでした。',
      ok: false,
    };
    confirming = false;
    draw();
  };

  // --- 操作 ------------------------------------------------------------------------------
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.dataset.form === 'class' && !classBusy) saveClass();
  });
  box.addEventListener('input', (e) => {
    if (e.target.name === 'terms_body') {
      draft = e.target.value;
      const n = box.querySelector('#st-terms-count');
      if (n) n.textContent = `${draft.trim().length.toLocaleString()} / ${MAX_TERMS.toLocaleString()}文字`;
    }
  });
  box.addEventListener('change', (e) => {
    if (e.target.name === 'is_active' && form) { readForm(); draw(); }
  });
  box.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'reload') load();
    else if (act === 'class-add') {
      form = { id: '', name: '', grade_min: null, grade_max: null, capacity: '', required_coaches: 1, sort_order: (classes.at(-1)?.sort_order ?? 0) + 1, is_active: true };
      formErrors = {}; classNotice = { text: '', ok: false }; draw();
      box.querySelector('[name="name"]')?.focus();
    } else if (act === 'class-edit') {
      const c = classes.find((x) => x.id === e.target.closest('[data-id]').dataset.id);
      form = { ...c, original: c.name, capacity: c.capacity ?? '' };
      formErrors = {}; classNotice = { text: '', ok: false }; draw();
      box.querySelector('[name="name"]')?.focus();
    } else if (act === 'class-cancel') { form = null; formErrors = {}; draw(); }
    else if (act === 'terms-toggle') { showBody = !showBody; draw(); }
    else if (act === 'terms-edit') {
      editing = true; confirming = false; draft = terms[0]?.body ?? ''; termsNotice = { text: '', ok: false }; draw();
      box.querySelector('#st-terms-body')?.focus();
    } else if (act === 'terms-cancel') { editing = false; confirming = false; termsNotice = { text: '', ok: false }; draw(); }
    else if (act === 'terms-confirm') {
      const t = draft.trim();
      if (!t || t.length > MAX_TERMS) { termsNotice = { text: `本文を入れてください（${MAX_TERMS.toLocaleString()}文字まで）。`, ok: false }; draw(); return; }
      if (terms[0] && t === terms[0].body.trim()) { termsNotice = { text: 'いまの版と同じ本文です。直したいところを書き換えてください。', ok: false }; draw(); return; }
      confirming = true; termsNotice = { text: '', ok: false }; draw();
      box.querySelector('[data-act="terms-publish"]')?.focus();
    } else if (act === 'terms-back') { confirming = false; draw(); box.querySelector('#st-terms-body')?.focus(); }
    else if (act === 'terms-publish' && !termsBusy) publish();
  });
  load();
}
