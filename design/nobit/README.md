# ノビットの素材

ユーザー提供の3枚の画像（`sheets/`）から、1体ずつ背景を透過して切り出したものです。基本形（黄緑の丸い体、頭の芽、大きな目、ピンクのほっぺ）は元画像のまま変えていません。

## 使いどころ（基本仕様書 2章）

画面に出すのは、タスクを完了した瞬間、ガチャの結果、連続記録が途切れたあとの再開の3つだけです。ホームの応援は画像を出さず、「ノビット」の名前を添えた一文にします。アプリで使う分は `web/public/nobit/` に表示サイズの2倍で置いています。

| アプリのファイル | 元の素材 | 使う画面 |
|---|---|---|
| `complete.png` | 喜ぶ（`cut/expr_joy.png`） | 02 タスク完了の瞬間（Phase 1） |
| `gacha.png` | 驚く（`cut/expr_surprised.png`） | 05 無料ガチャの結果（Phase 2） |
| `welcome-back.png` | 手をふる（`cut/expr_wave.png`） | 08 記録が途切れたあと（Phase 3） |
| `front.png` | 正面（`cut/front.png`） | ファビコン |

`line-oa-icon.png`（640×640）は NOBIT! 公式LINE のプロフィール画像用です。

## 解像度について

正面（`cut/front.png`）は 739×854 で、大きく使っても輪郭がぼやけません。表情・ポーズの切り出しは元の一覧画像の大きさのままなので、1体あたり 100〜180px 程度です。画面では高さ 96px 前後までなら2倍の密度で表示できますが、それより大きく使う場合や、LINE スタンプ・印刷物に使う場合は、表情ごとの高解像度データ（PNG 1000px 以上か SVG）が必要です。

切り出しの効果線（!・汗・音符など）と、体から離れた紙吹雪は外しています。手に持つ物（星・旗・本・パソコン・リュック・コイン）は残しています。

## 元画像

| ファイル | 内容 |
|---|---|
| `sheets/front_original.png` | 正面（1092×1092） |
| `sheets/pose_sheet.png` | 基本ポーズ・表情・シーン（1344×896） |
| `sheets/expression_sheet.png` | 表情15種・ポーズ8種（1344×896） |

`pose_sheet.png` の下の欄には旧ブランドの「ACE LABO」が入っています。資料などで一覧ごと見せる場合は、NOBIT! LABO の表記で作り直してください。

## 切り出した素材の一覧

| ファイル | 名前 | 大きさ（px） |
|---|---|---|
| `cut/front.png` | 正面（高解像度） | 739×854 |
| `cut/pose_basic_front.png` | 通常（正面） | 160×195 |
| `cut/pose_basic_wave.png` | 手を振る | 162×193 |
| `cut/pose_basic_side.png` | 横向き | 131×183 |
| `cut/pose_basic_back.png` | うしろ姿 | 152×198 |
| `cut/pose_basic_jump.png` | ジャンプ | 155×168 |
| `cut/pose_basic_star.png` | 星を持つ | 157×197 |
| `cut/pose_face_smile.png` | にっこり | 152×178 |
| `cut/pose_face_surprised.png` | びっくり | 149×175 |
| `cut/pose_face_wink.png` | ウインク | 145×169 |
| `cut/pose_face_motivated.png` | やる気 | 143×169 |
| `cut/pose_face_sleepy.png` | ねむい | 157×165 |
| `cut/pose_face_sad.png` | しょんぼり | 140×163 |
| `cut/pose_face_celebrate.png` | お祝い | 138×166 |
| `cut/pose_scene_study.png` | 勉強する | 159×146 |
| `cut/pose_scene_laptop.png` | パソコンを使う | 149×147 |
| `cut/pose_scene_cheer_flag.png` | 応援する（旗） | 153×158 |
| `cut/pose_scene_commute.png` | 登校・通学 | 118×147 |
| `cut/pose_scene_break.png` | 休憩する | 110×140 |
| `cut/pose_scene_coin.png` | コインをゲット | 115×138 |
| `cut/pose_scene_gacha.png` | ガチャ演出 | 110×148 |
| `cut/expr_main_basic.png` | 基本ポーズ（大） | 321×363 |
| `cut/expr_joy.png` | 喜ぶ | 180×192 |
| `cut/expr_surprised.png` | 驚く | 166×197 |
| `cut/expr_wave.png` | 手をふる | 160×190 |
| `cut/expr_excited.png` | はしゃぐ | 163×194 |
| `cut/expr_wink.png` | ウインク | 163×193 |
| `cut/expr_happy.png` | うれしい | 152×176 |
| `cut/expr_sad.png` | しょんぼり | 143×173 |
| `cut/expr_motivated.png` | やる気 | 154×174 |
| `cut/expr_sleepy.png` | ねむい | 148×175 |
| `cut/expr_cheer.png` | 応援する（メガホン） | 166×175 |
| `cut/expr_thinking.png` | 考える | 135×160 |
| `cut/expr_shy.png` | 照れる | 138×159 |
| `cut/expr_thanks.png` | ありがとう | 137×153 |
| `cut/expr_troubled.png` | 困る | 134×152 |
| `cut/expr_doing_best.png` | がんばる | 141×153 |
| `cut/expr_run.png` | 走る | 117×140 |
| `cut/expr_jump.png` | ジャンプ | 116×120 |
| `cut/expr_read.png` | 座る・読む | 104×124 |
| `cut/expr_laptop.png` | パソコンを使う | 124×125 |
| `cut/expr_flag.png` | フラッグを持つ | 131×145 |
| `cut/expr_commute.png` | 通学する | 100×125 |
| `cut/expr_collection.png` | コレクション | 105×120 |
| `cut/expr_relax.png` | リラックス | 104×117 |
