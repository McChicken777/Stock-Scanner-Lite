-- Track when a worker has seen the manager's decision on their leave request.
ALTER TABLE leave_requests ADD COLUMN worker_acknowledged_at TIMESTAMP;
