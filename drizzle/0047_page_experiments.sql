CREATE TABLE product_page_experiments (
 product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),owner TEXT NOT NULL,draft TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE product_page_experiment_runs (
 id TEXT PRIMARY KEY NOT NULL,owner TEXT NOT NULL,product_id TEXT NOT NULL REFERENCES products(id),revision INTEGER NOT NULL,snapshot TEXT NOT NULL,baseline TEXT NOT NULL,activated_at INTEGER NOT NULL,closed_at INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX product_page_experiment_open ON product_page_experiment_runs(product_id) WHERE closed_at IS NULL;
--> statement-breakpoint
CREATE INDEX product_page_experiment_owner ON product_page_experiment_runs(owner,product_id,activated_at);
--> statement-breakpoint
CREATE TABLE product_page_experiment_assignments (
 id TEXT PRIMARY KEY NOT NULL,run_id TEXT NOT NULL REFERENCES product_page_experiment_runs(id),owner TEXT NOT NULL,product_id TEXT NOT NULL,session_id TEXT NOT NULL,variant TEXT NOT NULL CHECK(variant IN ('a','b')),created_at INTEGER NOT NULL,exposed_at INTEGER,cta_at INTEGER,excluded_at INTEGER,UNIQUE(run_id,session_id)
);
--> statement-breakpoint
CREATE INDEX product_page_experiment_session ON product_page_experiment_assignments(product_id,session_id,exposed_at);
--> statement-breakpoint
CREATE INDEX product_page_experiment_assignment_rate ON product_page_experiment_assignments(product_id,created_at);
--> statement-breakpoint
CREATE TABLE product_page_experiment_orders (
 order_id TEXT PRIMARY KEY NOT NULL,assignment_id TEXT NOT NULL REFERENCES product_page_experiment_assignments(id),run_id TEXT NOT NULL REFERENCES product_page_experiment_runs(id),owner TEXT NOT NULL,product_id TEXT NOT NULL,created_at INTEGER NOT NULL
);
