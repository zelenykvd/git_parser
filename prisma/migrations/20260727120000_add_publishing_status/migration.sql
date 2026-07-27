-- Add transient PUBLISHING state used as an atomic lock during post publishing
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'PUBLISHING';
