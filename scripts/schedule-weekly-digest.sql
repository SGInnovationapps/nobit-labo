-- 毎週月曜 8:00（JST）= 日曜 23:00（UTC）に weekly-digest を呼ぶ。Supabase の SQL エディタで1回だけ実行する。
-- ［プロジェクトURL］と［DIGEST_SECRET］は自分の値に置き換える。pg_cron と pg_net は Database > Extensions で有効にしておく。
select cron.schedule('weekly-digest', '0 23 * * 0',
  $$select net.http_post(
      url := 'https://［プロジェクトREF］.supabase.co/functions/v1/weekly-digest',
      headers := '{"x-cron-secret":"［DIGEST_SECRET］","Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb)$$);
