-- Connection-loss violation kind
-- ------------------------------------------------------------------
-- Adds `offline_mid_trip` to the allowed `driver_violations.kind`
-- values. It records that a driver's device lost its internet
-- connection during an active trip, so their live location stopped
-- reaching the rider.
--
-- Unlike the location-off violations, this kind is RECORDED ONLY — it
-- does not feed the 2-strike auto-deactivation. A dropped mobile
-- signal (dead zone, tunnel, rural coverage gap) is frequently not
-- the driver's fault, so an admin reviews these rather than the
-- system locking the driver out automatically. The skip is enforced
-- in src/app/api/driver/violations/report/route.ts.
--
-- Safe to run more than once.

ALTER TABLE public.driver_violations
  DROP CONSTRAINT IF EXISTS driver_violations_kind_check;

ALTER TABLE public.driver_violations
  ADD CONSTRAINT driver_violations_kind_check CHECK (
    kind IN (
      'location_off_mid_trip',
      'location_off_while_online',
      'permission_denied_at_toggle',
      'offline_mid_trip'
    )
  );
