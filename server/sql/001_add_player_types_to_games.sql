alter table games
  add column if not exists player1_type text,
  add column if not exists player2_type text;
