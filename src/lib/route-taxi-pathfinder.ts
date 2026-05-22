/**
 * Multi-leg route taxi pathfinder.
 *
 * Treats Jamaica's TA-licensed corridors as a graph: each endpoint
 * (parish town, square, bus park) is a node, each `routes` row is two
 * bidirectional edges (route taxis run both ways). Given an arbitrary
 * pickup + dropoff lat/lng, we:
 *
 *   1. Snap the pickup to the nearest corridor endpoint within
 *      MAX_SNAP_KM (riders walk a short distance to a corridor head).
 *   2. Snap the dropoff to the nearest corridor endpoint within
 *      MAX_SNAP_KM.
 *   3. Run Dijkstra over the corridor graph from start to end,
 *      minimising the total fare (which is what the rider cares
 *      about).
 *   4. Return the cheapest path as an ordered list of legs.
 *
 * A "direct" trip is just a path of length 1. The single quote
 * endpoint stays uniform — caller doesn't branch on single vs multi.
 *
 * Cache: the corridor graph is rebuilt at most every 5 minutes. The
 * routes table changes via admin tooling, not user traffic, so cold
 * reads only matter on cold start.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateRouteFare, calculateConcessionFare } from "@/lib/fare-engine";
import { haversineKm } from "@/lib/jamaica";

/** Snap radius — how far a rider may walk to reach a corridor head. */
export const MAX_SNAP_KM = 5;

/** Hard cap on path length so we don't return absurd 6-transfer chains. */
export const MAX_LEGS = 4;

export type CorridorLeg = {
  routeId: string;
  /** Start endpoint name as the rider will board. */
  origin: string;
  /** End endpoint name as the rider will alight. */
  destination: string;
  /** Forward = same as routes.origin → destination; reverse = the other way. */
  direction: "forward" | "reverse";
  distanceKm: number;
  /** Per-leg fare (already concession-adjusted if applicable). */
  fareJmd: number;
  /** Coordinates of the alight point — used by the predictive matcher
   *  in Phase 2 to broadcast the transfer arrival to nearby drivers. */
  destinationLat: number | null;
  destinationLng: number | null;
};

export type CorridorPath = {
  legs: CorridorLeg[];
  totalFareJmd: number;
  totalDistanceKm: number;
  legCount: number;
  /** True if the pickup and / or dropoff snapped to an endpoint that
   *  isn't an exact match for the rider's typed location — surfaced
   *  in the UI so the rider knows "you'll board at Negril Square,
   *  about 300m walk from your pickup". */
  pickupSnap: { endpoint: string; walkKm: number } | null;
  dropoffSnap: { endpoint: string; walkKm: number } | null;
};

/* ────────────────────────── Graph construction ────────────────────────── */

type GraphNode = {
  /** Lowercased trimmed endpoint name — the dedup key. */
  key: string;
  /** Display name (whichever spelling we saw first). */
  name: string;
  /** Best-known coordinates for this endpoint — used for snapping. */
  lat: number | null;
  lng: number | null;
};

type GraphEdge = {
  routeId: string;
  fromKey: string;
  toKey: string;
  direction: "forward" | "reverse";
  distanceKm: number;
  fareJmd: number;
  destLat: number | null;
  destLng: number | null;
};

type CorridorGraph = {
  nodes: Map<string, GraphNode>;
  /** Adjacency list keyed by node key. */
  edgesByFrom: Map<string, GraphEdge[]>;
  /** All endpoints with coordinates — used to spatial-search for snap candidates. */
  geoNodes: Array<{ key: string; lat: number; lng: number; name: string }>;
};

type RouteRow = {
  id: string;
  origin_name: string;
  destination_name: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | string;
  ta_fare_jmd: number;
  active: boolean;
};

let cachedGraph: { graph: CorridorGraph; builtAt: number } | null = null;
const GRAPH_TTL_MS = 5 * 60 * 1000;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Load all active corridors and build the bidirectional graph. */
async function buildGraph(supabase: SupabaseClient): Promise<CorridorGraph> {
  const { data, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, ta_fare_jmd, active",
    )
    .eq("active", true);

  if (error) {
    throw new Error(`pathfinder: failed to load routes — ${error.message}`);
  }
  const rows = (data ?? []) as RouteRow[];

  const nodes = new Map<string, GraphNode>();
  const edgesByFrom = new Map<string, GraphEdge[]>();

  const upsertNode = (
    name: string,
    lat: number | null,
    lng: number | null,
  ): string => {
    const key = normalize(name);
    const existing = nodes.get(key);
    if (existing) {
      // Promote coords if the existing node lacked them.
      if (existing.lat == null && lat != null) existing.lat = lat;
      if (existing.lng == null && lng != null) existing.lng = lng;
      return key;
    }
    nodes.set(key, { key, name, lat, lng });
    return key;
  };

  for (const r of rows) {
    const distance = typeof r.distance_km === "string"
      ? parseFloat(r.distance_km)
      : r.distance_km;
    if (!Number.isFinite(distance) || distance <= 0) continue;

    // Per-leg fare uses the TA-published number when available, else
    // the formula. Same logic as src/app/api/rider/route-taxi/hail.
    const formula = calculateRouteFare(distance);
    const fareJmd = r.ta_fare_jmd > 0 ? r.ta_fare_jmd : formula;

    const fromKey = upsertNode(r.origin_name, r.origin_lat, r.origin_lng);
    const toKey = upsertNode(
      r.destination_name,
      r.destination_lat,
      r.destination_lng,
    );

    // Self-loops would deadlock Dijkstra and don't exist in the data.
    if (fromKey === toKey) continue;

    const forward: GraphEdge = {
      routeId: r.id,
      fromKey,
      toKey,
      direction: "forward",
      distanceKm: distance,
      fareJmd,
      destLat: r.destination_lat,
      destLng: r.destination_lng,
    };
    const reverse: GraphEdge = {
      routeId: r.id,
      fromKey: toKey,
      toKey: fromKey,
      direction: "reverse",
      distanceKm: distance,
      fareJmd,
      destLat: r.origin_lat,
      destLng: r.origin_lng,
    };
    pushEdge(edgesByFrom, forward);
    pushEdge(edgesByFrom, reverse);
  }

  const geoNodes: CorridorGraph["geoNodes"] = [];
  for (const n of nodes.values()) {
    if (n.lat != null && n.lng != null) {
      geoNodes.push({ key: n.key, lat: n.lat, lng: n.lng, name: n.name });
    }
  }

  return { nodes, edgesByFrom, geoNodes };
}

function pushEdge(map: Map<string, GraphEdge[]>, e: GraphEdge) {
  const arr = map.get(e.fromKey);
  if (arr) arr.push(e);
  else map.set(e.fromKey, [e]);
}

async function getGraph(supabase: SupabaseClient): Promise<CorridorGraph> {
  const now = Date.now();
  if (cachedGraph && now - cachedGraph.builtAt < GRAPH_TTL_MS) {
    return cachedGraph.graph;
  }
  const graph = await buildGraph(supabase);
  cachedGraph = { graph, builtAt: now };
  return graph;
}

/** Test seam — admin tooling that edits routes invalidates the cache. */
export function invalidateRouteGraphCache(): void {
  cachedGraph = null;
}

/* ────────────────────────── Snap helpers ────────────────────────── */

type SnapCandidate = { key: string; name: string; walkKm: number };

function nearestEndpoints(
  graph: CorridorGraph,
  point: { lat: number; lng: number },
  maxKm: number,
  limit: number,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  for (const n of graph.geoNodes) {
    const walkKm = haversineKm(point, { lat: n.lat, lng: n.lng });
    if (walkKm <= maxKm) {
      candidates.push({ key: n.key, name: n.name, walkKm });
    }
  }
  candidates.sort((a, b) => a.walkKm - b.walkKm);
  return candidates.slice(0, limit);
}

/* ────────────────────────── Dijkstra ────────────────────────── */

/**
 * Shortest path by total fare. Returns the edge list back to back from
 * `startKey` to `endKey`, or null when no path exists within `maxLegs`.
 *
 * Tiny graph (< 1000 nodes) so a flat priority array beats a heap on
 * constant factors. If/when the corridor count blows up we can swap to
 * a binary heap with no API change.
 */
function dijkstra(
  graph: CorridorGraph,
  startKey: string,
  endKey: string,
  maxLegs: number,
): GraphEdge[] | null {
  if (startKey === endKey) return [];
  type Entry = { key: string; cost: number; legs: number };
  const dist = new Map<string, number>();
  const prev = new Map<string, { edge: GraphEdge; from: string } | null>();
  const queue: Entry[] = [{ key: startKey, cost: 0, legs: 0 }];
  dist.set(startKey, 0);
  prev.set(startKey, null);

  while (queue.length > 0) {
    // Pop min — linear scan is fine for this size.
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i].cost < queue[bestIdx].cost) bestIdx = i;
    }
    const current = queue.splice(bestIdx, 1)[0];

    if (current.key === endKey) break;
    if (current.legs >= maxLegs) continue;
    // Stale entry — a cheaper path has already been finalised.
    const best = dist.get(current.key);
    if (best !== undefined && current.cost > best) continue;

    const edges = graph.edgesByFrom.get(current.key) ?? [];
    for (const edge of edges) {
      const nextCost = current.cost + edge.fareJmd;
      const nextLegs = current.legs + 1;
      const known = dist.get(edge.toKey);
      if (known !== undefined && known <= nextCost) continue;
      dist.set(edge.toKey, nextCost);
      prev.set(edge.toKey, { edge, from: current.key });
      queue.push({ key: edge.toKey, cost: nextCost, legs: nextLegs });
    }
  }

  if (!dist.has(endKey)) return null;

  // Reconstruct.
  const path: GraphEdge[] = [];
  let cursor: string | undefined = endKey;
  while (cursor && cursor !== startKey) {
    const step = prev.get(cursor);
    if (!step) return null;
    path.unshift(step.edge);
    cursor = step.from;
  }
  return path;
}

/* ────────────────────────── Public API ────────────────────────── */

export async function findRouteTaxiPath(
  supabase: SupabaseClient,
  args: {
    pickup: { lat: number; lng: number; name?: string | null };
    dropoff: { lat: number; lng: number; name?: string | null };
    concession?: boolean;
    /** Override the default snap radius — used by tests. */
    maxSnapKm?: number;
    /** Override the default leg cap — useful for emergency
     *  "any path however ridiculous" debug calls. */
    maxLegs?: number;
  },
): Promise<CorridorPath | null> {
  const graph = await getGraph(supabase);
  if (graph.geoNodes.length === 0) return null;

  const snapKm = args.maxSnapKm ?? MAX_SNAP_KM;
  const maxLegs = args.maxLegs ?? MAX_LEGS;

  const startCandidates = nearestEndpoints(graph, args.pickup, snapKm, 5);
  const endCandidates = nearestEndpoints(graph, args.dropoff, snapKm, 5);
  if (startCandidates.length === 0 || endCandidates.length === 0) {
    return null;
  }

  // Try every start × end pair and keep the cheapest result. Each call
  // is O(edges) — with 5 × 5 = 25 starts at most, this is well under a
  // millisecond on Jamaica's corridor count.
  let best: {
    path: GraphEdge[];
    fareJmd: number;
    start: SnapCandidate;
    end: SnapCandidate;
  } | null = null;

  for (const start of startCandidates) {
    for (const end of endCandidates) {
      const path = dijkstra(graph, start.key, end.key, maxLegs);
      if (!path) continue;
      const fareJmd = path.reduce((s, e) => s + e.fareJmd, 0);
      // Penalise the walk slightly so a 100m-walk + 1-leg trip beats
      // a 4km-walk + 1-leg trip if both fares match. ~$50 per walked
      // kilometre is a reasonable proxy for rider effort.
      const score = fareJmd + (start.walkKm + end.walkKm) * 50;
      const bestScore = best
        ? best.fareJmd + (best.start.walkKm + best.end.walkKm) * 50
        : Infinity;
      if (score < bestScore) {
        best = { path, fareJmd, start, end };
      }
    }
  }

  if (!best) return null;

  // Build the response. We expand each edge into a leg, then apply the
  // concession discount per-leg (TA allows concession on any leg).
  const legs: CorridorLeg[] = best.path.map((edge) => {
    const node = graph.nodes.get(edge.fromKey)!;
    const dest = graph.nodes.get(edge.toKey)!;
    const baseFare = edge.fareJmd;
    const legFare = args.concession
      ? calculateConcessionFare(edge.distanceKm)
      : baseFare;
    return {
      routeId: edge.routeId,
      origin: node.name,
      destination: dest.name,
      direction: edge.direction,
      distanceKm: edge.distanceKm,
      fareJmd: legFare,
      destinationLat: edge.destLat,
      destinationLng: edge.destLng,
    };
  });

  const totalFareJmd = legs.reduce((s, l) => s + l.fareJmd, 0);
  const totalDistanceKm = legs.reduce((s, l) => s + l.distanceKm, 0);

  const pickupTyped = args.pickup.name?.trim();
  const dropoffTyped = args.dropoff.name?.trim();
  const startEndpoint = graph.nodes.get(best.start.key)!.name;
  const endEndpoint = graph.nodes.get(best.end.key)!.name;

  return {
    legs,
    totalFareJmd,
    totalDistanceKm,
    legCount: legs.length,
    pickupSnap:
      pickupTyped && normalize(pickupTyped) === best.start.key
        ? null
        : { endpoint: startEndpoint, walkKm: best.start.walkKm },
    dropoffSnap:
      dropoffTyped && normalize(dropoffTyped) === best.end.key
        ? null
        : { endpoint: endEndpoint, walkKm: best.end.walkKm },
  };
}
