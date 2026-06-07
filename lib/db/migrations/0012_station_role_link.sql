-- Link each station type to the worker role that operates it.
-- Workers with that role are automatically routed to this station's queue.
ALTER TABLE station_types ADD COLUMN role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
