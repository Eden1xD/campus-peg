-- Campus PEG (opção B): tabelas próprias do jogo, isoladas do PEG oficial. Não destrutivo.
CREATE TABLE IF NOT EXISTS school_saves (
  id serial PRIMARY KEY,
  player_key varchar(64) NOT NULL,
  slot varchar(24) NOT NULL DEFAULT 'main',
  version integer NOT NULL DEFAULT 1,
  school_name text NOT NULL DEFAULT 'Escola PEG',
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS school_saves_player_slot_uq ON school_saves (player_key, slot);
CREATE TABLE IF NOT EXISTS school_ad_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_key varchar(64) NOT NULL,
  reward varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS school_ad_sessions_player_idx ON school_ad_sessions (player_key, created_at);
