/**
 * Human-readable explanation for a ride that has ended.
 *
 * Used by the "trip ended" cards on the rider live-trip and driver
 * active-trip pages so BOTH sides always see exactly WHY a trip ended
 * — a wrong-PIN cancellation, a no-show, an expiry, or the other
 * party's own reason — never a vague "Trip cancelled" that hides what
 * actually happened.
 */

export type EndedViewer = "rider" | "driver";

export function describeEndedTrip(
  status: "cancelled" | "completed",
  cancellationReason: string | null,
  viewer: EndedViewer,
): { title: string; detail: string } {
  if (status === "completed") {
    return { title: "Trip completed", detail: "This trip was completed." };
  }

  switch (cancellationReason) {
    case "rider_no_show":
      return {
        title: "Trip cancelled — no-show",
        detail:
          viewer === "driver"
            ? "The rider didn't show up at the pickup, so the no-show fee was applied."
            : "The driver waited at the pickup and a no-show fee was applied.",
      };
    case "pin_mismatch":
      return {
        title: "Trip cancelled — wrong PIN",
        detail:
          viewer === "driver"
            ? "The start PIN was entered incorrectly 3 times, so the trip was cancelled for safety."
            : "The driver entered the wrong start PIN 3 times, so the trip was cancelled for your safety.",
      };
    case "expired_no_driver":
      return {
        title: "No driver found",
        detail: "No driver accepted this trip in time.",
      };
    default:
      break;
  }

  // Anything else is a free-text reason the rider/driver typed or
  // picked when they cancelled — show it verbatim, never hide it.
  const reason = cancellationReason?.trim();
  if (reason) {
    return {
      title: "Trip cancelled",
      detail:
        viewer === "driver"
          ? `The rider cancelled this trip. Reason: ${reason}`
          : `This trip was cancelled. Reason: ${reason}`,
    };
  }
  return {
    title: "Trip cancelled",
    detail:
      viewer === "driver"
        ? "The rider cancelled this trip."
        : "This trip was cancelled.",
  };
}
