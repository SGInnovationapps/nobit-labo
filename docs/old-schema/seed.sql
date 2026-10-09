-- 最初の運営者と最初のクラブを作る。
-- メールアドレスとクラブ名を書き換えてから、Supabase の SQL Editor で実行する。
-- 運営者はこのメールアドレスで /admin にログインすると、全クラブを扱えるようになる。
insert into users (role, email, display_name)
values ('operator', 'gymspiral@gmail.com', '運営');

insert into clubs (name, invite_code)
values ('［NOBIT! LABO］', nobit_new_invite_code());
