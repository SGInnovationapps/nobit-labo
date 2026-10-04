# NOBIT!（ノビット）

ジュニア体操クラブに通う中高生向けの学習記録 LINE ミニアプリと、その管理画面です。
きょうのキミが、明日のキミを育てる。

正式な基準は「NOBIT! 基本仕様書 v1.4」です。
https://claude.ai/code/artifact/d4dc8dcd-d7f8-4904-ae78-d5b9b2c73514

仕様書の各章とこのリポジトリの対応は [docs/spec-mapping.md](docs/spec-mapping.md) にまとめています。

## いまできていること（Phase 1）

生徒用（LINE ミニアプリ）は、招待QRからの登録（保護者同意・学年・表示名・承認待ち）、01 ホーム、02 タスク完了の瞬間、03 勉強タイマー、やった勉強の記録（自由登録）、LINE への連絡の設定です。
管理用は、09 生徒一覧（運営には対応アラート）、10 生徒の詳細・応援、11 タスク管理、14 クラブ設定（招待QR・所属承認・クラブ管理者）です。

データベースは仕様書7章の25テーブルをすべて作ってあります。コイン・休息チケット・大会日の処理もサーバー側にはありますが、画面には `VITE_PHASE=2` にするまで出しません。

## 構成

```
nobit/
├─ web/                    生徒用と管理画面（Vite + React + TypeScript）
│  ├─ src/student/         生徒用（/）
│  ├─ src/admin/           管理画面（/admin）
│  ├─ src/demo/            見本データ（?demo=1）
│  └─ public/nobit/        画面で使うノビット
├─ supabase/
│  ├─ migrations/          テーブル・RLS・RPC・定時処理
│  ├─ functions/           Edge Functions（auth-line、line-webhook）
│  ├─ tests/               受入テスト（DB で確かめられる項目）
│  └─ seed.sql             最初の運営者とクラブ
├─ design/nobit/           ノビットの素材一式と公式LINE 用アイコン
├─ docs/spec-mapping.md    仕様書との対応と、実装で決めたこと
├─ scripts/test-db.sh      DB テストの実行
└─ netlify.toml
```

フロントは Next.js ではなく Vite にしています。LINE ミニアプリは静的な画面の配信だけで足り、サーバー側の処理は Supabase に寄せているためです。

## 見本データで画面を見る

LINE と Supabase がなくても、見本データで画面を確かめられます。

```sh
cd web
npm ci
npm run dev
```

- 生徒用：http://localhost:5173/?demo=1
- 登録の画面：http://localhost:5173/?demo=1&state=unregistered&club=K7QM2XRA
- 勉強タイマーが動いている状態：http://localhost:5173/?demo=1&timer=1
- タイマーが自動で止まったあと：http://localhost:5173/?demo=1&stopped=idle（`app_closed`、`time_limit` も選べます）
- 管理画面（運営）：http://localhost:5173/admin?demo=1
- 管理画面（クラブ管理者）：http://localhost:5173/admin?demo=1&role=club_admin

## 始める前に決めること

- **LINE のプロバイダー**：LINE ミニアプリのチャネルと公式LINE（Messaging API）のチャネルは、同じプロバイダーに作ります。ユーザーIDはプロバイダーごとに発行されるため、別にすると将来の自動送信（push）が届きません。チャネルはあとから別のプロバイダーへ移せません。
- **提供・契約の主体（会社名）**：公式LINE の運営名義と、保護者同意の文面に入ります。同意の文面は `web/src/student/Register.tsx` の［会社名］［問い合わせ先］を書き換えます。

## セットアップ

上から順に進めると、最初の生徒が登録できるところまで動きます。途中で控える値は次のとおりです。

| 値 | どこで得るか | どこに入れるか |
|---|---|---|
| Project ref・URL・anon キー | Supabase の Project Settings | Netlify の環境変数、CLI |
| LIFF ID | LINE ミニアプリのチャネル | Netlify の環境変数 |
| LINE ミニアプリのチャネルID | 同上 | Supabase のシークレット |
| 公式LINE のチャネルシークレット | Messaging API のチャネル | Supabase のシークレット |
| 公式LINE のベーシックID | LINE Official Account Manager | Netlify の環境変数 |
| Netlify のサイト URL | Netlify | LINE のエンドポイント URL、Supabase の Site URL |

### 1. GitHub に上げる

GitHub で空のリポジトリ（例：nobit、Private）を作り、このフォルダで次を実行します。

```sh
git init
git add .
git commit -m "NOBIT! Phase 1"
git branch -M main
git remote add origin git@github.com:<アカウント>/nobit.git
git push -u origin main
```

Actions タブで CI の3つ（画面、データベース、Edge Functions）が成功することを確かめます。`.env` で始まるファイルは上がりません（見本の `.env.example` だけ上がります）。

### 2. Supabase を用意する

1. New project を作ります。リージョンは Northeast Asia (Tokyo) です。
2. 手元で CLI からつなぎ、マイグレーションを当てます。

   ```sh
   supabase login
   supabase link --project-ref <Project ref>
   supabase db push
   ```

3. `supabase/seed.sql` のメールアドレスとクラブ名を書き換え、SQL Editor で実行します。このメールアドレスが最初の運営者になります。
4. 定時処理が登録されたことを確かめます。`nobit-` で始まるジョブが3つ出れば成功です。

   ```sql
   select jobname, schedule from cron.job order by jobname;
   ```

   出ない場合は、Database › Extensions で pg_cron を有効にしてから、`supabase/migrations/20261002000005_jobs.sql` の pg_cron の部分（`do $$ ... $$`）を SQL Editor で実行します。

5. Authentication › Sign In / Providers で Email が有効になっていることを確かめます。管理画面のメールリンクと、生徒のセッション発行（auth-line）の両方で使います。
6. Authentication › Rate Limits で、トークンの検証とメール送信の上限を見直します。生徒のログインは Edge Function からまとめて行うため、同じ IP からの検証として数えられます。クラブ全員が一度に開いても届くように、検証の上限を生徒数より大きくします。

### 3. Netlify でサイトを作る

1. Add new site › Import an existing project で、GitHub の nobit を選びます。`netlify.toml` があるので、ビルドの設定は不要です。
2. 一度デプロイして、サイトの URL（例：https://nobit-xxxx.netlify.app）を確定します。この時点では環境変数がないので画面は動きません。
3. Supabase の Authentication › URL Configuration で、Site URL にサイトの URL を、Redirect URLs に `https://<サイト>/admin` を入れます。

### 4. LINE Developers のチャネルを作る

同じプロバイダー（例：NOBIT! LABO）の下に2つ作ります。

1. **LINE ミニアプリ**のチャネル。エンドポイント URL はサイトの URL（末尾 `/`）、スコープは `openid` と `profile` です。発行された LIFF ID とチャネルIDを控えます。チャネルの設定で NOBIT! 公式LINE をリンクし、ログイン時に友だち追加を案内するようにします。友だち状態の取得（友だち追加の案内に使う）にも、このリンクが必要です。
2. **Messaging API**のチャネル（NOBIT! 公式LINE）。チャネルシークレットを控えます。Webhook URL は `https://<Project ref>.supabase.co/functions/v1/line-webhook` で、Webhook の利用をオンにします。

LINE Official Account Manager の応答設定では、チャットと Webhook の両方をオンにします。運営はこのチャットから生徒に連絡します。あいさつメッセージにはミニアプリの URL を入れ、リッチメニューにはホームへの入口を置きます。プロフィール画像には `design/nobit/line-oa-icon.png` を使えます。

当面は Messaging API での送信（push）は使いません。チャネルアクセストークンは発行しなくてかまいません。

### 5. Edge Functions と Netlify を仕上げる

1. `supabase/functions/.env.example` を `supabase/functions/.env` にコピーして値を入れ、登録とデプロイをします。

   ```sh
   supabase secrets set --env-file supabase/functions/.env
   supabase functions deploy auth-line
   supabase functions deploy line-webhook
   ```

2. LINE Developers の Messaging API チャネルで Webhook の「検証」を押し、成功することを確かめます。
3. Netlify の Site configuration › Environment variables に、`web/.env.example` の項目（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_LIFF_ID`、`VITE_LINE_OA_BASIC_ID`、`VITE_PHASE=1`）を入れて、再デプロイします。

### 6. 最初のログインと動作確認

1. `https://<サイト>/admin` を開き、seed.sql に入れたメールアドレスでログインします。届いたメールのリンクを押すと、運営として入れます。
2. クラブ設定で、クラブ管理者を追加します（メールアドレスと表示名）。追加した人は、そのメールアドレスで `/admin` にログインすると、自分のクラブだけを見られます。
3. クラブ設定の招待QRを保存し、生徒用の LINE アカウントで読み取ります。LINE ログイン、保護者同意、学年と表示名の入力まで進めます。
4. クラブ設定の「所属の承認」で承認します。
5. タスク管理でタスクを1つ作り、生徒の画面で完了します。完了時刻が残り、記録の帯の今日の棒が伸びれば成功です。
6. 生徒一覧に、その生徒の今日の記録が出ることを確かめます。

## 日々の開発

- **画面**：`cd web && npm run dev`。見本データは `?demo=1` です。
- **DB のテスト**：PostgreSQL があれば、`PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres bash scripts/test-db.sh` で、マイグレーションと受入テストを流せます。CI でも同じものが動きます。
- **フェーズの切り替え**：Netlify の `VITE_PHASE` を 2 にすると、コイン、休息チケット、大会日の登録、報酬コインの入力が画面に出ます。
- **DB の変更**：`supabase/migrations/` に新しいファイルを足して `supabase db push` します。画面から呼ぶ関数を足したときは、ファイルの最後で `grant execute ... to authenticated` を書きます。何も書かないと呼べません（既定で閉じています）。

## 運用の流れ（生徒への連絡）

管理画面の生徒一覧に、運営にだけ「対応アラート」が出ます。アラートは、未着手（18時以降）、記録が空いた（3日）、連続記録の節目（7・30・100日）の3種類です。

1. アラートの「文面をコピー」を押します。
2. LINE Official Account Manager のチャットで、その生徒に送ります。
3. 管理画面で「連絡済みにする」を押します。

連絡済みのあと24時間の完了数が、効果として残ります。送らないと決めたアラートは「送らない」で閉じます。LINE への連絡を止めている生徒には、アラートを出しません。

アラートの条件と文面は `alert_rules` テーブルにあります。送り方（`delivery`）はすべて `manual` です。自動送信（push）に切り替えるときは、送信の関数と画面13を足して、`delivery` を `push` に変えます。それまでは、管理画面に送信ボタンを置きません。

## 勉強タイマー

机に向かったらホームのボタンをスライドし、タイマーを出します。経過時間は、サーバーが記録した開始時刻から数えます。次のどれかで止まり、そこまでの時間が記録されます。

| 止まり方 | 記録する終わりの時刻 |
|---|---|
| スライドして終える | 終えた時刻 |
| アプリを閉じる | 閉じた時刻（閉じるときに送る） |
| 画面が消えたまま10分たつ［仮］ | 最後に画面が開いていた時刻 |
| 始めてから2時間たつ［仮］（消し忘れ防止） | 開始から2時間の時刻 |

アプリを閉じたときの合図は、通信の状況によって届かないことがあります。そのため画面は、開いている間1分ごとにサーバーへ知らせます。知らせが10分途絶えたら、閉じたとみなして最後の時刻で止めます。タイマーの間は、対応する端末で画面が消えないようにしています。止め忘れは、5分ごとの定時処理（`nobit-study-sweep`）と、生徒が次に開いたときに片づけます。自動で止まった記録は、次に開いたときに生徒へ見せます。

報酬は、その日の合計時間で数えます。15分たまるごとに1ブロックとして5コインを付け、1日8ブロック（2時間）までです［仮］。タイマーを何回かに分けても、合計で数えます。台帳のIDは日付とブロックの番号で決まるため、二重には付きません。コインの表示は、ほかのコインと同じく `VITE_PHASE=2` からです。

勉強時間は、保護者同意でクラブ管理者に見せる範囲（完了したタスクと記録の帯）に入っていません。そのため勉強時間を見られるのは、本人と運営だけです。クラブ管理者にも見せる場合は、同意の文面と版（`consent_version`）を変えてください。連続記録の条件（タスク1件以上の完了）は変えていません。

## 仮置き（［仮］）の値

仮置きの値は、DB の `nobit_config()`（`supabase/migrations/20261002000002_access.sql`）に集めています。

| 項目 | 値 |
|---|---|
| 自由登録 | 1件5コイン、1日3件まで |
| 運営設定タスク | 10コイン |
| 休息チケット | 毎週月曜に1枚、所持は2枚まで |
| 勉強タイマーの上限（消し忘れ防止） | 2時間 |
| 画面が消えて止めるまで | 10分 |
| 勉強タイマーの報酬 | 15分ごとに5コイン、1日8ブロック（2時間）まで |
| 保護者同意の版 | `2026-10-v1` |

確定したら、この関数を新しいマイグレーションで差し替えます。保護者同意の版を上げると、登録時に新しい版への同意が必要になります。閲覧範囲を変えたときは版を上げます。

## まだ確かめていないこと

実際の LINE と Supabase につないだ動作は、まだ確かめていません。とくに次の3つは、上の手順6で確かめてください。

- **auth-line のセッション発行**：メールリンクのトークンをサーバー側で検証する方式です。
- **友だち状態の取得**：ミニアプリのチャネルと公式LINE のリンクが必要です。
- **定時処理の時刻**：日本時間の 0:05 と、毎時0分に動きます。
- **勉強タイマーの止まり方**：LINE のアプリ内の画面で確かめてください。確かめるのは次の2点です。
  - アプリを閉じたときに、その時刻で止まるか。
  - タイマーの間に画面が消えないか。

  画面が消える端末では、10分で止まります。iPhone で画面が消える場合は、`study_idle_minutes` を長くするか、画面を消さない設定にするよう案内してください。
