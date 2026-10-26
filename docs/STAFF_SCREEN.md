# 職員の画面（工程5）

事務担当・コーチがログインしたときの画面。仕様は `docs/SPEC.md` の 5-1（ロールと権限）・6章（画面一覧）・10-3（機能の段階的な解放）。

| もの | 場所 |
|---|---|
| 枠（上・左のメニュー・画面の切り替え）とホーム | `public/js/staff-app.js` |
| ホームの「やること」を数える関数 `staff_todo()` | `supabase/migrations/012_staff_home.sql` |
| ログインのあと、職員ならこの画面を出す | `public/js/main.js` |
| 見た目 | `public/css/app.css` の「職員の画面」 |
| 入会承認・紙の申込書からの登録（工程5-4・5-5） | `public/js/staff-admission.js` |
| 承認・紙の登録の関数 `approve_member()`・`register_paper_member()` | `supabase/migrations/013_admission.sql` |
| 生年月日・名前・電話の確かめ（保護者の申込フォームと共通） | `public/js/form-check.js` |
| 会員名簿（工程5-6） | `public/js/staff-roster.js` |
| 設定：クラス・会員規約（工程5-8） | `public/js/staff-settings.js` |
| 名簿のビュー `staff_roster`・規約の改定 `publish_terms()` | `supabase/migrations/014_roster_settings.sql` |
| テスト | `tests/staff_todo_test.sql`・`tests/admission_test.sql`・`tests/roster_test.sql` |

# 枠とホーム（工程5-1・5-2）

## 画面の形

- **上**：クラブ名・ログインしている人（表示名があれば「高橋（コーチ）」、なければ「事務担当」「コーチ」）・ログアウト
- **左のメニュー**（860px以上。スマホでは上に横並びで、横にすべらせる）。役割ごとに出す項目が違い、閉じている機能の項目は出さない

  | 役割 | 項目（かっこは、その機能が開いているときだけ） |
  |---|---|
  | 事務担当 | ホーム／入会承認／（開講情報：`schedule`）／（シフト確定：`shifts`）／会員名簿／（月謝チェックリスト：`fees`）／（お知らせ：`notices`）／Excel取り込み・書き出し／設定 |
  | コーチ | ホーム／（出席の記録：`attendance`）／（シフト希望：`shifts`）／（フィードバック・引き継ぎメモ：`feedback`）／（級の付け替え：`tags`） |

- メニューにない画面（ほかの役割の画面・閉じている機能・知らない URL）は、URL を直接開いてもホームに戻る
- ホーム・入会承認・会員名簿・設定のほかは、いまは「準備中」（作る工程の番号を添える）
- LINEアプリの中で開いたときだけ、メニューの下に「閉じる（LINEに戻る）」

## 事務担当のホーム：やること

3つの行を、いつも同じ順に出す。やることがある行は左の線と数が茶色になり、押すとその画面に移る。

| 行 | 出すもの | 押すと | 出す条件 |
|---|---|---|---|
| 入会承認待ち | 申込中の子の人数（なければ「なし」） | 入会承認 | いつも |
| ○月分の開講 | 来月分が未確定なら「未確定」と確定の予定日、確定していれば「確定済み」 | 開講情報 | `schedule` が開いている |
| 出欠の未入力 | 回数と、新しい順に5回（日付・時刻・クラス）。6回以上は「ほか○回」 | 開講情報 | `attendance` が開いている |

「出欠の未入力」は、次をすべて満たす回：確定か会場変更の回／今日から31日前まで（今日の回は終わる時刻を過ぎてから）／
そのクラスに在籍中の子がいる／出欠の記録が1人分もない（1人でも入っていれば入力したとみなす）。

## コーチのホーム

- **今日の担当クラス**：担当クラスの今日の回（申込中は出さない）。時刻・クラス・会場。中止は取り消し線と理由、会場変更は内容
- 担当が1つもなければ「担当のクラスがまだ登録されていません。事務担当にお知らせください。」
- **やること**：担当クラスの出欠の未入力（あるときだけ）。押すと出席の記録へ

## データの読み方

- ログインしたときのクライアントで読む（管理用キーは使わない）。見えるものは RLS が決める
- 開いたときに、クラブの設定（機能の開け閉め）と自分の表示名を同時に読む
- やることは `staff_todo()` を1回呼ぶだけ。**呼んだ人の権限で数える**（security invoker）ので、
  事務担当にはクラブ全体、コーチには担当クラスの分だけが数えられる。保護者が呼ぶとエラー
- コーチの今日の回は、担当（`coach_assignments` の自分の行）・クラス名・今日の回の3つを同時に読み、画面で突き合わせる

## 確かめ方（工程5-1・5-2）

上から順に進める。SQL はダッシュボードの SQL Editor で流す。
自分の登録（クラブ `trial`）を一時的に事務担当・コーチに変えて確かめ、最後に保護者に戻す。

### 1. 前提

- 今回のファイルを push し、Cloudflare の公開が終わっている（1〜2分）

### 2. 012 を本番に流す

1. ダッシュボード → SQL Editor → New query
2. `supabase/migrations/012_staff_home.sql` の中身をすべて貼り付けて Run
3. 「Success. No rows returned」と出れば成功。最後の検査に引っかかったときはエラーになり、何も変わらない

### 3. 確かめ用のデータを入れる（事務担当にする）

前の工程の確かめ用データを消してから、自分の登録を事務担当にし、クラス2つ・在籍中の子3人・申込中の子2人・開講日・来月の確定予定日を入れる。
**入れた日と同じ日のうちに確かめる**（日付は今日から数えて作るため。今日の回は 23:00〜23:59 にしてある）。

```sql
-- 1) 前の確かめ用データを消す
delete from makeup_credits where club_id = (select id from clubs where slug = 'trial');
delete from club_months    where club_id = (select id from clubs where slug = 'trial');
delete from notices
 where club_id = (select id from clubs where slug = 'trial') and title like '【ホーム確認】%';
delete from sessions
 where class_id in (select c.id from classes c join clubs k on k.id = c.club_id where k.slug = 'trial' and c.name like 'ホーム確認%');
delete from members
 where club_id = (select id from clubs where slug = 'trial') and (family_name = 'ホーム確認' or status = 'pending');
delete from classes
 where club_id = (select id from clubs where slug = 'trial') and name like 'ホーム確認%';
delete from terms_versions where club_id = (select id from clubs where slug = 'trial');
update clubs set config = '{}' where slug = 'trial';

-- 2) 自分の登録を事務担当にする（7. の後片付けで保護者に戻す）
update profiles set role = 'admin'
 where user_id = (select p.user_id from profiles p join clubs c on c.id = p.club_id
                   where c.slug = 'trial' and p.role in ('guardian', 'coach')
                   order by p.created_at desc limit 1);

-- 3) クラス2つ・在籍中の子3人（低学年2人・高学年1人）
with k as (select id as club_id from clubs where slug = 'trial'),
     cls as (
       insert into classes (club_id, name)
       select k.club_id, x.name from k, (values ('ホーム確認 低学年'), ('ホーム確認 高学年')) as x(name)
       returning id, club_id, name
     )
insert into members (club_id, status, member_no, approved_at, family_name, given_name, family_kana, given_kana, birth_date, class_id)
select cls.club_id, 'active', x.no, now(), 'ホーム確認', x.given, 'ほーむかくにん', x.given, x.birth, cls.id
  from cls
  join (values (9901, 'はると', date '2017-06-01', 'ホーム確認 低学年'),
               (9902, 'そら',   date '2018-02-14', 'ホーム確認 低学年'),
               (9903, 'みお',   date '2014-09-10', 'ホーム確認 高学年')) as x(no, given, birth, class_name)
    on x.class_name = cls.name;

-- 申込中の子2人（入会承認待ち）
insert into members (club_id, status, family_name, given_name, family_kana, given_kana, birth_date)
select id, 'pending', 'ホーム確認', x.given, 'ほーむかくにん', x.given, x.birth
  from clubs, (values ('ゆい', date '2020-08-03'), ('りく', date '2019-11-21')) as x(given, birth)
 where slug = 'trial';

-- 開講日：低学年 3日前（未入力）・7日前（入力済み）・今日 23:00〜23:59
--         高学年 2日前（未入力）・5日前（中止）・今日 23:00〜23:59（会場変更）
with t as (select (now() at time zone 'Asia/Tokyo')::date as d),
     cls as (select c.id, c.club_id, c.name from classes c join clubs k on k.id = c.club_id
              where k.slug = 'trial' and c.name like 'ホーム確認%')
insert into sessions (club_id, class_id, session_date, start_time, end_time, venue, status, lottery, change_note)
select cls.club_id, cls.id, t.d + x.days, x.st::time, x.en::time, x.venue, x.status, 'won', x.note
  from t, cls
  join (values ('ホーム確認 低学年', -3, '16:00', '17:00', '西体育館',   'confirmed',     null),
               ('ホーム確認 低学年', -7, '16:00', '17:00', '西体育館',   'confirmed',     null),
               ('ホーム確認 低学年',  0, '23:00', '23:59', '西体育館',   'confirmed',     null),
               ('ホーム確認 高学年', -2, '18:00', '19:30', '中央体育館', 'confirmed',     null),
               ('ホーム確認 高学年', -5, '18:00', '19:30', '中央体育館', 'cancelled',     '体育館の都合で中止です'),
               ('ホーム確認 高学年',  0, '23:00', '23:59', '東体育館',   'venue_changed', '東体育館に変わりました'))
    as x(class_name, days, st, en, venue, status, note)
    on x.class_name = cls.name;

-- 7日前の回（低学年）は、はるとの出席を記録済みにする
insert into attendances (club_id, session_id, member_id, status)
select s.club_id, s.id, m.id, 'present'
  from sessions s
  join classes c on c.id = s.class_id and c.name = 'ホーム確認 低学年'
  join members m on m.class_id = c.id and m.given_name = 'はると'
 where s.session_date = (now() at time zone 'Asia/Tokyo')::date - 7;

-- 来月分：まだ確定していない。確定の予定日は10日後
insert into club_months (club_id, month, expected_confirm_on)
select id, (date_trunc('month', (now() at time zone 'Asia/Tokyo')) + interval '1 month')::date,
       (now() at time zone 'Asia/Tokyo')::date + 10
  from clubs where slug = 'trial';
```

### 4. パソコン（ブラウザ）で確かめる（事務担当）

`https://clubena.gymspiral.workers.dev/trial/` をパソコンで開き、LINEでログインする（ログイン済みなら再読み込み）。

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | 開く | 上に「ログイン確認用」「事務担当」「ログアウト」。左のメニュー：ホーム／入会承認／開講情報／会員名簿／お知らせ／Excel取り込み・書き出し／設定（シフト確定・月謝チェックリストは出ない） |
| 2 | やることを見る | 「3つあります。」。入会承認待ち **2人**／○月分（来月）の開講 **未確定**（10日後の日付ごろ確定の予定です）／出欠の未入力 **2回**（2日前 18:00 ホーム確認 高学年・3日前 16:00 ホーム確認 低学年） |
| 3 | 「入会承認待ち」の行を押す | 「入会承認」の準備中の画面（工程5-4で作ります）。メニューの「入会承認」に印 |
| 4 | 「ホームに戻る」→「出欠の未入力」の行を押す | 「開講情報」の準備中の画面 |
| 5 | アドレス欄の最後を `#/attendance` にして開く（コーチの画面） | ホームに戻る |
| 6 | 画面の幅を狭くする（ウィンドウを細く） | メニューが上に横並びになり、横にすべらせられる。画面が横にはみ出さない |
| 7 | 開発者ツールのコンソール（F12） | LINE のユーザーID・トークンが出ていない |

### 5. 機能の開け閉めを確かめる

SQL Editor で設定を変え、ブラウザを再読み込みする。

1. 予定と出席記録を閉じ、月謝とシフトを開く → メニューから「開講情報」が消え、「シフト確定」「月謝チェックリスト」が出る。やることは「入会承認待ち」の1行だけ

   ```sql
   update clubs set config = '{"features": {"schedule": false, "attendance": false, "fees": true, "shifts": true}}'
    where slug = 'trial';
   ```

2. アドレス欄の最後を `#/sessions` にして開く → ホームに戻る（閉じている機能の画面には入れない）
3. 元に戻す

   ```sql
   update clubs set config = '{}' where slug = 'trial';
   ```

### 6. コーチの画面を確かめる（スマホ・LINEの中）

自分の登録をコーチにして、「ホーム確認 低学年」の担当にする。

```sql
-- 自分の登録をコーチにして、低学年の担当にする
update profiles set role = 'coach'
 where user_id = (select p.user_id from profiles p join clubs c on c.id = p.club_id
                   where c.slug = 'trial' and p.role = 'admin'
                   order by p.created_at desc limit 1);
insert into coach_assignments (club_id, coach_user_id, class_id)
select c.club_id, p.user_id, c.id
  from classes c
  join clubs k on k.id = c.club_id and k.slug = 'trial'
  join profiles p on p.club_id = c.club_id and p.role = 'coach'
 where c.name = 'ホーム確認 低学年'
   and p.user_id = (select p2.user_id from profiles p2 where p2.club_id = c.club_id and p2.role = 'coach'
                     order by p2.created_at desc limit 1);
```

スマホで `https://miniapp.line.me/2012160402-vA9GMKfg/trial/` を開く（開いていれば閉じて開き直す）。

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | 開く | 上に「コーチ」。メニュー：ホーム／出席の記録。その下に「閉じる（LINEに戻る）」 |
| 2 | 今日の担当クラスを見る | 23:00〜23:59 ホーム確認 低学年・西体育館 の1つだけ（高学年の会場変更の回は担当外なので出ない） |
| 3 | やることを見る | 出欠の未入力 **1回**（3日前 16:00 ホーム確認 低学年）。高学年の2日前の回は出ない |
| 4 | 出欠の未入力の行を押す | 「出席の記録」の準備中の画面（工程7-2で作ります） |
| 5 | 「閉じる（LINEに戻る）」 | ミニアプリが閉じて LINE に戻る |

### 7. 後片付け（保護者に戻す）

自分の登録を保護者に戻し、確かめ用のデータを消す。開き直すと、子のいない保護者の表示（入会申込）に戻る。

```sql
-- 自分の登録を保護者に戻す（担当の割り当ても消す）
delete from coach_assignments
 where club_id = (select id from clubs where slug = 'trial');
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role in ('admin', 'coach');
-- 確かめ用のデータを消す（子を消すと出欠の記録も一緒に消える）
delete from club_months
 where club_id = (select id from clubs where slug = 'trial');
delete from sessions
 where class_id in (select c.id from classes c join clubs k on k.id = c.club_id where k.slug = 'trial' and c.name like 'ホーム確認%');
delete from members
 where club_id = (select id from clubs where slug = 'trial') and family_name = 'ホーム確認';
delete from classes
 where club_id = (select id from clubs where slug = 'trial') and name like 'ホーム確認%';
update clubs set config = '{}' where slug = 'trial';
```


---

# 入会承認と紙の申込書からの登録（工程5-4・5-5）

事務担当のメニューの「入会承認」。仕様は `docs/SPEC.md` 4-1（新しく入会する人の流れ・LINEを使わない家庭）。

## 入会承認（`#/approvals`）

- LINEから届いた申込（申込中の子）を、**家族ごと**（同じ保護者が申し込んだ子）に、**古い順**に並べる。きょうだいは1つの枠に入る
- 子ごとに：名前とふりがな・生年月日・学年・年齢、クラスの選択、「承認して会員番号を発行」、「申込を取り消す」
- **クラスの選択**：使っているクラスだけ。対象学年に合うクラスに「（対象学年）」を添え、はじめから選んでおく（変えてよい）
- **承認すると**、会員番号を大きく出す（例：`0002`）。「紙の入会書類の『会員番号』の欄に、この番号を書き写してください」。
  「書き写しました（一覧に戻る）」で一覧に戻る。保護者の画面には、次に開いたときから在籍中として出る
- **同じ子かもしれないときの注意**：同じふりがな・生年月日の在籍中の会員がいれば、その会員番号と
  「在籍中の家庭が招待コードを使わずに申し込んだのかもしれません」。申込どうしで同じなら「片方を取り消してください」
- **申込の取り消し**：その場で「取り消すと、この申込は消え、保護者の画面からも見えなくなります。元には戻せません」と確かめてから消す
  （申込中の子だけ。つながり・緊急連絡先・同意も一緒に消える）
- 使っているクラスが1つもなければ、承認のボタンは押せない

## 紙の申込書から登録（`#/approvals/paper`）

LINEを使わない家庭の子を、紙の申込書を見ながら1人ずつ登録する。登録するとすぐ在籍中になり、会員番号が決まる。

- 入れるもの：姓・名・せい・めい・生年月日（年・月・日を選ぶ。学年・年齢がその場で出る）・クラス・緊急連絡先（1件目は必ず、2件目は任意）
- 生年月日を選ぶと、対象学年に合うクラスを選んでおく
- 「紙の申込書で、会員規約（第○版）への同意（署名など）を確かめました」にチェックがないと登録できない。
  同意は「紙」・入力した事務担当の名義で記録する
- 登録すると、会員番号を大きく出す。「続けてきょうだいを登録する（姓・せい・緊急連絡先を引き継ぐ）」「別の家庭の子を登録する」「入会承認に戻る」
- 住所・学校名など、紙の申込書のほかの項目は入れない（紙のまま、会員番号で保管する）
- 同じふりがな・生年月日の子が、在籍中か申込中ですでにいれば登録しない（退会した子と同じなら登録できる）

## 会員番号の決め方

- クラブごとに、最後に発行した番号（`clubs.last_member_no`）の次。**欠番は使い回さない**（子を消しても番号は戻らない）
- Excel の取り込みなどで、それより大きい番号の会員がすでにいれば、その番号の次から
- 同時に2人が承認しても、同じ番号にはならない（クラブの行を1つずつ更新するため）
- 9999番まで。使い切ったら「運営にお問い合わせください」

## データの読み方・書き方

- 一覧は3つを同時に読む：会員（退会以外）・保護者とのつながり・使っているクラス。事務担当なので RLS でクラブ全体が見える
- 書くのは `approve_member()`・`register_paper_member()`（`013_admission.sql`）と、申込の取り消し（申込中の会員の削除）だけ
- 2つの関数は**呼んだ人の権限で動く**（security invoker）。事務担当でなければ `not_allowed`。
  緊急連絡先は記録が残る関数 `save_emergency_contacts` を通して書く。途中で決まりに反したら、番号の発行も含めて何も残らない

## 確かめ方（工程5-4・5-5）

上から順に進める。SQL はダッシュボードの SQL Editor で流す。
保護者としてスマホから申し込み → 事務担当としてパソコンで承認・紙の登録 → 保護者に戻って番号を確かめる、の順で、入会の流れを通しで確かめる。

### 1. 前提

- 今回のファイルを push し、Cloudflare の公開が終わっている（1〜2分）

### 2. 013 を本番に流す

1. ダッシュボード → SQL Editor → New query
2. `supabase/migrations/013_admission.sql` の中身をすべて貼り付けて Run
3. 「Success. No rows returned」と出れば成功。最後の検査に引っかかったときはエラーになり、何も変わらない

### 3. 確かめ用のデータを入れる（保護者にする）

**クラブ `trial` の子をすべて消してから**、会員規約・クラス3つ・在籍中の会員1人（1番）と、その子と同じふりがな・生年月日の申込1件を入れる。
自分の登録は保護者にする（前の工程の事務担当・コーチのままでも戻る）。

```sql
-- 1) 前の確かめ用データと、trial の子をすべて消す
delete from coach_assignments where club_id = (select id from clubs where slug = 'trial');
delete from makeup_credits    where club_id = (select id from clubs where slug = 'trial');
delete from club_months       where club_id = (select id from clubs where slug = 'trial');
delete from notices           where club_id = (select id from clubs where slug = 'trial');
delete from sessions          where club_id = (select id from clubs where slug = 'trial');
delete from members           where club_id = (select id from clubs where slug = 'trial');
delete from classes           where club_id = (select id from clubs where slug = 'trial');
delete from terms_versions    where club_id = (select id from clubs where slug = 'trial');
update clubs set config = '{}', last_member_no = 0 where slug = 'trial';

-- 2) 自分の登録を保護者にする（前の工程で事務担当・コーチにしたままでも戻る）
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role in ('admin', 'coach');

-- 3) 会員規約・クラス・在籍中の会員1人・同じ子かもしれない申込1件
insert into terms_versions (club_id, version, body)
select id, 1, E'【確かめ用の会員規約 第1版】\n\n第1条（目的）\nこの規約は、クラブの会員が守ることを定めます。'
  from clubs where slug = 'trial';

insert into classes (club_id, name, grade_min, grade_max, sort_order)
select id, x.name, x.gmin, x.gmax, x.ord
  from clubs, (values ('ホーム確認 幼児', -2, 0, 1), ('ホーム確認 低学年', 1, 3, 2), ('ホーム確認 高学年', 4, 6, 3)) as x(name, gmin, gmax, ord)
 where slug = 'trial';

insert into members (club_id, status, member_no, approved_at, family_name, given_name, family_kana, given_kana, birth_date, class_id)
select c.id, 'active', 1, now(), 'ホーム確認', 'そら', 'ほーむかくにん', 'そら', '2016-02-02', k.id
  from clubs c join classes k on k.club_id = c.id and k.name = 'ホーム確認 高学年'
 where c.slug = 'trial';
update clubs set last_member_no = 1 where slug = 'trial';

insert into members (club_id, status, family_name, given_name, family_kana, given_kana, birth_date, applied_at)
select id, 'pending', 'ホーム確認', 'そら', 'ほーむかくにん', 'そら', '2016-02-02', now() - interval '3 day'
  from clubs where slug = 'trial';
```

### 4. スマホ（LINEの中）で申し込む（保護者）

`https://miniapp.line.me/2012160402-vA9GMKfg/trial/` を開くと、子がいないので入会申込フォームが出る。次の2人をきょうだいとして申し込む。

| | 姓 | 名 | せい | めい | 生年月日 |
|---|---|---|---|---|---|
| 1人目 | 上野 | はると | うえの | はると | 2017年6月12日 |
| 2人目 | 上野 | ゆい | うえの | ゆい | 2020年8月3日 |

緊急連絡先は何でもよい（例：上野 美咲・母・090-1234-5678）。規約に同意して送ると「申込を受け付けました」。

### 5. 事務担当にする

```sql
-- 自分の登録を事務担当にする
update profiles set role = 'admin'
 where club_id = (select id from clubs where slug = 'trial') and role = 'guardian';
```

### 6. パソコン（ブラウザ）で確かめる（事務担当）

`https://clubena.gymspiral.workers.dev/trial/` をパソコンで開き、LINEでログインする（ログイン済みなら再読み込み）。

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | ホームのやること | 入会承認待ち **3人** |
| 2 | 「入会承認待ち」の行を押す | 入会承認。枠が2つ、古い順に「（3日前）の申込」（ホーム確認 そら）・「（今日）の申込（きょうだい2人）」（上野 はると・上野 ゆい） |
| 3 | 「ホーム確認 そら」の枠を見る | 茶色の注意「同じふりがな・生年月日の会員がいます（会員番号 0001）。…」 |
| 4 | 上野 はると・上野 ゆいのクラスを見る | はると：ホーム確認 低学年（対象学年）、ゆい：ホーム確認 幼児（対象学年）が選ばれている |
| 5 | はるとの「承認して会員番号を発行」 | 「会員番号を発行しました」と大きく **0002**、「上野 はるとさん（うえの はると）・ホーム確認 低学年」 |
| 6 | 「書き写しました（一覧に戻る）」 | はるとが一覧から消える |
| 7 | ホーム確認 そらの「申込を取り消す」→ 確かめの文言を見て「やめる」→ もう一度「申込を取り消す」→「取り消す」 | 「やめる」では消えない。「取り消す」で緑の「ホーム確認 そらさんの申込を取り消しました。」、一覧はゆいだけ |
| 8 | 上の「紙の申込書から登録する（LINEを使わない家庭）」 | 紙の申込書から登録する画面 |
| 9 | 何も入れずに「登録して会員番号を発行」 | 各欄に赤い説明。いちばん上の「姓」に移る |
| 10 | 姓 紙野・名 たろう・せい `カミノ`（カタカナ）・めい たろう、生年月日 2018年5月5日 | せいの欄を離れると「かみの」になる。「小2・8歳」などの学年、クラスに「ホーム確認 低学年（対象学年）」が選ばれる（学年は今日の日付で変わる） |
| 11 | 緊急連絡先1件目（紙野 花子・母・090-1111-2222）を入れ、同意のチェックを入れずに登録 | 「紙の申込書で規約への同意を確かめて、チェックを入れてください」 |
| 12 | チェックを入れて登録 | 大きく **0003**、「紙野 たろうさん（かみの たろう）・ホーム確認 低学年」 |
| 13 | 「続けてきょうだいを登録する」 | 姓「紙野」・せい「かみの」・緊急連絡先が入ったまま。名・めい・生年月日・クラスは空 |
| 14 | 名 じろう・めい じろう・生年月日 2020年1月10日、チェックを入れて登録 | 大きく **0004**（クラスは ホーム確認 幼児） |
| 15 | 「別の家庭の子を登録する」→ もう一度 紙野 たろう（かみの たろう・2018年5月5日）を入れて登録 | 「同じふりがな・生年月日の子が、すでに登録か申込されています。…」。番号は出ない |
| 16 | メニューの「ホーム」 | 入会承認待ち **1人**（ゆい） |
| 17 | 画面の幅を狭くする | 入会承認・紙の登録とも、横にはみ出さない |

記録を確かめる。

```sql
-- 会員番号・状態・クラス・規約の同意の方法（番号の順）
select m.member_no as 番号, m.family_name || ' ' || m.given_name as 名前, m.status as 状態,
       c.name as クラス, string_agg(t.method, ',') as 同意
  from members m
  left join classes c on c.id = m.class_id
  left join terms_consents t on t.member_id = m.id
 where m.club_id = (select id from clubs where slug = 'trial')
 group by m.id, c.name
 order by m.member_no nulls last, m.applied_at;

-- 最後に発行した番号
select last_member_no as 最後の番号 from clubs where slug = 'trial';
```

1番 ホーム確認 そら（同意なし）・2番 上野 はると（app）・3番 紙野 たろう（paper）・4番 紙野 じろう（paper）・番号なしの上野 ゆい（pending・app）。
最後の番号は **4**。

### 7. 保護者に戻して、スマホで確かめる

```sql
-- 自分の登録を保護者に戻す
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role = 'admin';
```

スマホで閉じて開き直す。

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | 開く | 子の切替に「はると（小3）」と「ゆい（年長・申込中）」。はるとは在籍中なので「申込中」が付かない |
| 2 | はるとを選んで「登録情報」 | 会員番号 **0002**、クラス「ホーム確認 低学年」 |
| 3 | ゆいを選ぶ | 「入会の申込を受け付けました」のまま（承認待ち） |

### 8. 会員番号を使い回さないことを確かめる（任意）

事務担当に戻し（5. の SQL）、入会承認でゆいを承認すると **0005**（2〜4番を発行したあとなので）。
子を消しても番号が戻らないことは、自動のテスト（`tests/admission_test.sql`）で確かめている。

### 9. 後片付け

自分の登録を保護者に戻し、trial の子・クラス・規約を消して、会員番号を0から数え直す。開き直すと「会員規約がまだ準備できていません」の画面になる（前の工程と同じ状態）。

```sql
-- 自分の登録を保護者に戻し、trial の子・クラス・規約を消して、会員番号を0から数え直す
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role in ('admin', 'coach');
delete from members        where club_id = (select id from clubs where slug = 'trial');
delete from classes        where club_id = (select id from clubs where slug = 'trial');
delete from terms_versions where club_id = (select id from clubs where slug = 'trial');
update clubs set config = '{}', last_member_no = 0 where slug = 'trial';
```


---

# 会員名簿と設定（工程5-6・5-8）

事務担当のメニューの「会員名簿」「設定」。

## 会員名簿（`#/members`）

- **絞り込み**：クラス（すべて／各クラス／クラスなし＝申込中）・状態（在籍中／申込中／退会／すべて。はじめは在籍中）・
  探す（名前・ふりがな・会員番号。カタカナ・全角・空白の違いは気にしない）
- **並べ方**：ふりがな順（はじめ）／会員番号順／学年順（上から）
- **1行**：会員番号（申込中は `----`）・名前とふりがな・学年と年齢・クラス・印
  （申込中／退会／LINEなし＝保護者のLINEがつながっていない在籍中の子／規約の同意待ち＝いちばん新しい版に同意していない／配慮あり）
- **押すと詳しく**：生年月日・申込日・承認日・退会日・保護者のLINE（何人つながっているか）・会員規約（何版に、アプリか紙か）・配慮の印・
  緊急連絡先（「緊急連絡先を表示する」を押したときだけ読む。表示した記録が残る）
- 上に「在籍中 ○人・この条件で ○人」
- **学年・年齢はデータベースの関数（`grade_label`・`age_on`）の値をそのまま出す**（ビュー `staff_roster`）。画面で計算し直さない

## 設定（`#/settings`）

**クラス**
- 一覧（並び順）：名前・対象学年（「小1〜小3」「小4から」「制限なし」）・定員・1回に要るコーチの人数・在籍の人数・使っていない印
- 「クラスを追加」「変更」で同じ入力欄：名前・対象学年（から・まで）・定員（空なら制限なし）・1回に要るコーチ・並び順・このクラスを使う
- 確かめ：名前は30文字まで・同じ名前は不可・対象学年の逆転は不可・定員1〜999・コーチ0〜20・並び順0〜999
- クラスは消さない（前の開講日・出欠が指しているため）。「使わない」にすると、承認・紙の登録で選べなくなる（今いる子はそのまま。在籍の子がいれば知らせる）
- 対象学年は、承認・紙の登録のとき、合うクラスを先に選んでおくのに使う

**会員規約**
- いまの版（第○版・公開日）・本文（「本文を見る」）・これまでの版
- 「改定する」→ いまの本文が入った入力欄で直す →「内容を確かめて公開へ」→ 知らせ
  （「公開すると、保護者は次にアプリを開いたとき、新しい規約に同意し直す画面が出ます。公開は取り消せません」）→「第○版として公開する」
- いまの版と同じ本文・空の本文は公開しない。前の版と同意の記録は消えない
- 規約がまだなければ「規約を作る」（第1版）。規約がないと、入会の申込も紙の登録もできないことを知らせる

## データの読み方・書き方

- 名簿：`staff_roster`（職員だけが読めるビュー。security_invoker）・クラス・規約のいちばん新しい版の3つを同時に読む
- クラス：`classes` に事務担当が直接書く（007 の許可。決まりはテーブルの検査が効く）
- 規約：`publish_terms()` だけで公開する。事務担当だけ。クラブの行を押さえて次の番号を決めるので、同時に2人が公開しても番号は重ならない

## 確かめ方（工程5-6・5-8）

上から順に進める。SQL はダッシュボードの SQL Editor で流す。

### 1. 前提

- 今回のファイルを push し、Cloudflare の公開が終わっている（1〜2分）

### 2. 014 を本番に流す

1. ダッシュボード → SQL Editor → New query
2. `supabase/migrations/014_roster_settings.sql` の中身をすべて貼り付けて Run
3. 「Success. No rows returned」と出れば成功。最後の検査に引っかかったときはエラーになり、何も変わらない

### 3. 確かめ用のデータを入れる（事務担当にする）

**クラブ `trial` の確かめ用データをすべて消してから**、規約 第1版・クラス4つ・会員6人を入れ、自分の登録を事務担当にする。
はると・ゆいは自分とつないでおく（あとで保護者に戻して、規約の再同意を確かめるため）。

```sql
-- 1) trial の確かめ用データをすべて消す
delete from coach_assignments where club_id = (select id from clubs where slug = 'trial');
delete from makeup_credits    where club_id = (select id from clubs where slug = 'trial');
delete from club_months       where club_id = (select id from clubs where slug = 'trial');
delete from notices           where club_id = (select id from clubs where slug = 'trial');
delete from sessions          where club_id = (select id from clubs where slug = 'trial');
delete from members           where club_id = (select id from clubs where slug = 'trial');
delete from classes           where club_id = (select id from clubs where slug = 'trial');
delete from terms_versions    where club_id = (select id from clubs where slug = 'trial');
update clubs set config = '{}', last_member_no = 5 where slug = 'trial';

-- 2) 自分の登録を事務担当にする
update profiles set role = 'admin'
 where club_id = (select id from clubs where slug = 'trial') and role in ('guardian', 'coach');

-- 3) 会員規約 第1版・クラス
insert into terms_versions (club_id, version, body)
select id, 1, E'【確かめ用の会員規約 第1版】\n\n第1条（目的）\nこの規約は、クラブの会員が守ることを定めます。'
  from clubs where slug = 'trial';

insert into classes (club_id, name, grade_min, grade_max, capacity, required_coaches, sort_order, is_active)
select id, x.name, x.gmin, x.gmax, x.cap, x.coaches, x.ord, x.active
  from clubs, (values ('ホーム確認 幼児',   -2,   0,    12,   2, 1, true),
                      ('ホーム確認 低学年',  1,   3,    null, 1, 2, true),
                      ('ホーム確認 高学年',  4,   6,    20,   1, 3, true),
                      ('ホーム確認 旧クラス', null, null, null, 1, 9, false))
       as x(name, gmin, gmax, cap, coaches, ord, active)
 where slug = 'trial';

-- 会員：在籍4人（番号1〜4）・退会1人（5）・申込中1人
--   みお（2015年4月2日）とあい（2016年4月1日）は、誕生日が1年違うのに同じ学年（4月1日生まれは前の学年に入る）
insert into members (club_id, status, member_no, approved_at, family_name, given_name, family_kana, given_kana,
                     birth_date, class_id, care_flag, withdrawn_on)
select k.id, x.status, x.no, now() - interval '30 day', x.fam, x.given, x.fkana, x.gkana, x.birth::date, c.id, x.care,
       case when x.status = 'withdrawn' then (now() at time zone 'Asia/Tokyo')::date - 10 end
  from clubs k
  join (values ('active',    1, '上野', 'はると', 'うえの',   'はると', '2017-06-12', 'ホーム確認 低学年', false),
               ('active',    2, '上野', 'ゆい',   'うえの',   'ゆい',   '2020-08-03', 'ホーム確認 幼児',   false),
               ('active',    3, '大西', 'みお',   'おおにし', 'みお',   '2015-04-02', 'ホーム確認 高学年', true),
               ('active',    4, '青木', 'あい',   'あおき',   'あい',   '2016-04-01', 'ホーム確認 高学年', false),
               ('withdrawn', 5, '江藤', 'そら',   'えとう',   'そら',   '2012-07-07', 'ホーム確認 高学年', false))
    as x(status, no, fam, given, fkana, gkana, birth, class_name, care) on true
  join classes c on c.club_id = k.id and c.name = x.class_name
 where k.slug = 'trial';
insert into members (club_id, status, family_name, given_name, family_kana, given_kana, birth_date)
select id, 'pending', '加藤', 'りく', 'かとう', 'りく', '2019-11-21' from clubs where slug = 'trial';

-- はると・ゆいを自分とつなぎ、第1版にアプリで同意済みにする。みおは紙で同意済み。あいは同意の記録なし
insert into guardian_members (club_id, guardian_user_id, member_id)
select m.club_id, p.user_id, m.id
  from members m
  join clubs k on k.id = m.club_id and k.slug = 'trial'
  join profiles p on p.club_id = m.club_id and p.role = 'admin'
 where m.given_name in ('はると', 'ゆい');
insert into terms_consents (club_id, member_id, terms_version_id, method, consented_by, recorded_by)
select m.club_id, m.id, v.id,
       case when m.given_name = 'みお' then 'paper' else 'app' end,
       case when m.given_name = 'みお' then null else p.user_id end,
       case when m.given_name = 'みお' then p.user_id end
  from members m
  join clubs k on k.id = m.club_id and k.slug = 'trial'
  join terms_versions v on v.club_id = m.club_id and v.version = 1
  join profiles p on p.club_id = m.club_id and p.role = 'admin'
 where m.given_name in ('はると', 'ゆい', 'みお');

-- はるとの緊急連絡先
insert into member_private (member_id, club_id, ec1_name, ec1_relation, ec1_phone)
select m.id, m.club_id, '上野 美咲', '母', '090-1234-5678'
  from members m join clubs k on k.id = m.club_id and k.slug = 'trial'
 where m.given_name = 'はると';
```

### 4. 会員名簿を確かめる（パソコン）

`https://clubena.gymspiral.workers.dev/trial/` をパソコンで開き、LINEでログインする（ログイン済みなら再読み込み）。
先に、データベースが計算した学年を出しておく（名簿の表示と比べる）。

```sql
-- データベースが計算した学年・年齢（名簿の表示と同じになるはず）
select coalesce(lpad(member_no::text, 4, '0'), '----') as 番号, family_name || ' ' || given_name as 名前,
       grade_label(birth_date) as 学年, age_on(birth_date) as 年齢, status as 状態
  from members
 where club_id = (select id from clubs where slug = 'trial')
 order by family_kana, given_kana;
```

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | メニューの「会員名簿」 | 「在籍中 4人・この条件で 4人」。ふりがな順に 青木 あい・上野 はると・上野 ゆい・大西 みお |
| 2 | 学年・年齢を、上の SQL の結果と比べる | 4人とも同じ。みお（2015年4月2日）とあい（2016年4月1日）は同じ学年 |
| 3 | 印を見る | あい：LINEなし・規約の同意待ち／みお：LINEなし・配慮あり／はると・ゆい：印なし |
| 4 | 並べ方を「会員番号順」 | 0001 はると・0002 ゆい・0003 みお・0004 あい |
| 5 | 状態を「すべて」 | 6人。0005 江藤 そら（退会）・`----` 加藤 りく（申込中）も出る |
| 6 | クラスを「ホーム確認 高学年」（状態はすべてのまま） | みお・あい・そら の3人 |
| 7 | クラスを「すべてのクラス」、状態を「在籍中」に戻し、探すに `ウエノ` | 上野 はると・上野 ゆい（「この条件で 2人」） |
| 8 | 探すに `3` | 0003 大西 みお |
| 9 | 探すを空にし、上野 はるとの行を押す | 生年月日・申込日・承認日・保護者のLINE「1人がつながっています」・会員規約「第1版に同意（アプリ）」・配慮の印「なし」 |
| 10 | 「緊急連絡先を表示する」 | 上野 美咲（母）090-1234-5678 |
| 11 | 大西 みおの行を押す | 会員規約「第1版に同意（紙）」、配慮の印「あり」。「緊急連絡先を表示する」→「緊急連絡先は登録されていません。」 |
| 12 | 画面の幅を狭くする | 横にはみ出さない。1行が2〜3段に折り返す |

### 5. 設定：クラスを確かめる（パソコン）

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | メニューの「設定」 | クラス：幼児（年少〜年長・定員12人・コーチ2人・在籍1人）／低学年（小1〜小3・制限なし・1人・在籍1人）／高学年（小4〜小6・20人・1人・在籍2人）／旧クラス（使っていない） |
| 2 | 「クラスを追加」→ 名前 `ホーム確認 低学年`、対象学年 小3から 小1まで、定員 0 で保存 | 「同じ名前のクラスがすでにあります」「対象学年の『から』と『まで』が逆です」「定員は1〜999…」 |
| 3 | 名前 `ホーム確認 選手コース`、対象学年 小3から（までは「上はなし」）、定員 15、コーチ 2 で保存 | 緑の「『ホーム確認 選手コース』を追加しました。」。一覧のいちばん下に「小3から・定員15人・コーチ2人・在籍0人」 |
| 4 | 「ホーム確認 高学年」の「変更」→「このクラスを使う」を外す | 「このクラスには在籍中の子が2人います。…」の知らせ |
| 5 | そのまま保存 | 「使っていない」の印が付く |
| 6 | 「入会承認」→「紙の申込書から登録する」でクラスの選択肢を見る | 「ホーム確認 高学年」は出ない（使っていないため）。「ホーム確認 選手コース」は出る |
| 7 | 設定に戻り、高学年の「変更」→「このクラスを使う」を入れて保存 | 印が消える |

### 6. 設定：会員規約を改定する（パソコン）

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | 会員規約を見る | 「いまの版：第1版（今日の日付に公開）」 |
| 2 | 「改定する」→ 何も変えずに「内容を確かめて公開へ」 | 「いまの版と同じ本文です。…」 |
| 3 | 本文の最後に `第2条（写真）練習中の写真を、クラブのお知らせに使うことがあります。` を足して「内容を確かめて公開へ」 | 「第2版として公開します。公開すると、保護者は次に…」と「第2版として公開する」「本文に戻る」。本文は直せない状態 |
| 4 | 「本文に戻る」 | また直せる |
| 5 | もう一度「内容を確かめて公開へ」→「第2版として公開する」 | 緑の「第2版を公開しました。…」。いまの版：第2版、これまでの版：第1版 |
| 6 | 会員名簿 | はると・ゆい・みお・あい の4人とも「規約の同意待ち」 |

記録を確かめる。

```sql
-- クラスと会員規約の版
select name as クラス, grade_min as から, grade_max as まで, capacity as 定員, required_coaches as コーチ,
       sort_order as 並び順, is_active as 使う
  from classes
 where club_id = (select id from clubs where slug = 'trial')
 order by sort_order, name;
select version as 版, left(replace(body, E'\n', ' '), 30) as 本文のはじめ, published_at as 公開日時
  from terms_versions
 where club_id = (select id from clubs where slug = 'trial')
 order by version;
```

クラスは5つ（選手コースが増え、旧クラスだけ「使う」が false）、規約は第1版・第2版。

### 7. 保護者に戻して、規約の再同意を確かめる（スマホ）

```sql
-- 自分の登録を保護者に戻す
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role = 'admin';
```

スマホで `https://miniapp.line.me/2012160402-vA9GMKfg/trial/` を開く（開いていれば閉じて開き直す）。

| # | すること | 出るはずのもの |
|---|---|---|
| 1 | 開く | ホームではなく「会員規約が改定されました」。対象：はるとさん・ゆいさん。第2版の本文（第2条（写真）がある） |
| 2 | チェックを入れて「同意して進む」 | ホームが出る。登録情報の会員規約は「第2版に同意（今日の日付・アプリ）」 |

### 8. 後片付け

自分の登録を保護者に戻し、trial の子・クラス・規約を消して、会員番号を0から数え直す。

```sql
-- 自分の登録を保護者に戻し、trial の子・クラス・規約を消して、会員番号を0から数え直す
update profiles set role = 'guardian'
 where club_id = (select id from clubs where slug = 'trial') and role in ('admin', 'coach');
delete from members        where club_id = (select id from clubs where slug = 'trial');
delete from classes        where club_id = (select id from clubs where slug = 'trial');
delete from terms_versions where club_id = (select id from clubs where slug = 'trial');
update clubs set config = '{}', last_member_no = 0 where slug = 'trial';
```
