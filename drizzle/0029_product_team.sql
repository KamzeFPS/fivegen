CREATE TABLE IF NOT EXISTS product_team_seats (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','live')),
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(order_id,email)
);
CREATE INDEX IF NOT EXISTS product_team_seats_email ON product_team_seats(email,mode,status,order_id);
CREATE INDEX IF NOT EXISTS product_team_seats_creator ON product_team_seats(owner,product_id,mode,status);
