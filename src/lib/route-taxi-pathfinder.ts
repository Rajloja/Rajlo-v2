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
import {
  closestPointOnPolyline,
  closestPointOnSegment,
  haversineKm,
} from "@/lib/jamaica";
import { fetchCorridorPolyline } from "@/lib/directions";

/** Snap radius — how far the pathfinder will look for a corridor to
 *  *consider*. We keep this generous (10 km) so the API can still
 *  surface "nearest pickup is N km away" info when the rider is off
 *  every corridor, without losing the corridor entirely. Whether
 *  that path is actually *hailable* is gated by MAX_HAILABLE_WALK_KM. */
export const MAX_SNAP_KM = 10;

/** Real walking distance — how far a rider may walk to a corridor and
 *  still hail directly. 1.0 km ≈ 12 min walk on flat ground; beyond
 *  that no one will actually do it (you'd take a private ride to the
 *  road, then hail). This is the hard gate on whether the rider can
 *  book a route taxi at all. Apply identically on the alighting end —
 *  alighting 5 km from your destination is just as broken. */
export const MAX_HAILABLE_WALK_KM = 1.0;

/** Hard cap on path length so we don't return absurd 6-transfer chains. */
export const MAX_LEGS = 4;

/** Distance threshold for collapsing two TA endpoints into the same
 *  logical node. The TA catalogue treats neighbourhoods as separate
 *  endpoints (e.g. "Negril" and "West End" — both Negril) which would
 *  otherwise leave the graph disconnected: West End owns the
 *  outbound corridor to Sav-la-Mar while Negril is the inbound node
 *  for half a dozen other routes. Clustering them lets a rider's
 *  pickup snap to either physical endpoint and reach all corridors
 *  outbound from EITHER neighbourhood — which matches how route
 *  taxis actually operate locally.
 *
 *  3.5 km catches Negril/West End (2.99 km apart) with comfortable
 *  margin, but stays below Sheffield (4.2 km from Negril) so genuinely
 *  separate corridor heads stay separate. */
export const CLUSTER_KM = 3.5;

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
  /** Coordinates of the corridor's origin endpoint (where the taxi
   *  starts on this leg). Renders the corridor polyline on the map. */
  originLat: number | null;
  originLng: number | null;
  /** Coordinates of the alight point — used by the predictive matcher
   *  in Phase 2 to broadcast the transfer arrival to nearby drivers. */
  destinationLat: number | null;
  destinationLng: number | null;
};

/**
 * Where the rider physically meets / leaves the route taxi.
 *
 * Computed by projecting the rider's typed pickup (or dropoff) onto
 * the corridor's road line, not just its named endpoints. So a
 * rider standing anywhere along an active corridor sees `walkKm: 0`
 * and "Hail right here". A rider off the corridor sees the
 * perpendicular projection point + the walking distance to it.
 */
export type CorridorAttachment = {
  /** Exact coords where the rider should stand to board / alight.
   *  This is what gets dropped as a pin on the map. */
  coords: { lat: number; lng: number };
  /** Human-readable description of the corridor the rider boards
   *  on / alights from — e.g. "Orange Bay → Negril". Drives the
   *  card copy ("Hail on Orange Bay → Negril road"). */
  corridorLabel: string;
  /** How far the rider walks from their typed location to the
   *  boarding / alighting point. Zero (or near-zero) means they're
   *  already on the corridor and can hail without moving. */
  walkKm: number;
  /** Where the rider boards / alights along the corridor as a
   *  human-readable hint: "near Orange Bay" (t≈0), "midway along"
   *  (t≈0.5), "near Negril" (t≈1). Lets the UI explain the position
   *  without needing the rider to read the map. */
  positionHint: string;
};

export type CorridorPath = {
  legs: CorridorLeg[];
  totalFareJmd: number;
  totalDistanceKm: number;
  legCount: number;
  /** Where the rider boards the first leg (mid-corridor projection,
   *  not the corridor's origin endpoint). */
  boarding: CorridorAttachment;
  /** Where the rider alights from the last leg. */
  alighting: CorridorAttachment;
  /** True when both walks are ≤ MAX_HAILABLE_WALK_KM — i.e. the
   *  rider is on (or essentially on) the corridor and can hail
   *  directly. False means the path geometrically exists but the
   *  rider needs to get to the road first; the API surfaces this as
   *  a "nearest pickup N km away" info card, never as a hail option. */
  hailable: boolean;
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
  /** Cluster root the edge starts at — Dijkstra operates on cluster
   *  roots, not on original endpoint keys, so adjacent neighbourhoods
   *  collapsed via `CLUSTER_KM` reach each other's outbound corridors. */
  fromKey: string;
  /** Cluster root the edge ends at. */
  toKey: string;
  /** Display name of the original origin endpoint (the actual route's
   *  `origin_name`). Used to render legs to the rider; without this
   *  we'd surface the cluster's canonical key, which may not match
   *  the route's real boarding point. */
  fromName: string;
  /** Display name of the original destination endpoint. */
  toName: string;
  /** Coordinates of the original origin endpoint — needed for honest
   *  snap-walk distance reporting on the rider's card. */
  fromLat: number | null;
  fromLng: number | null;
  direction: "forward" | "reverse";
  distanceKm: number;
  fareJmd: number;
  destLat: number | null;
  destLng: number | null;
  /** Actual driving polyline for the corridor (Google Directions),
   *  stored as a chain of `{lat, lng}` points. When present the snap
   *  step projects the rider onto this polyline instead of the
   *  straight line between fromLat/fromLng → destLat/destLng — which
   *  matters enormously on curved coastal / mountain roads where a
   *  rider standing on the road can be many km from the straight
   *  line. Reverse edges share the same polyline as their forward
   *  counterpart (the road is the same in both directions). */
  pathPolyline: Array<{ lat: number; lng: number }> | null;
};

type CorridorGraph = {
  /** All endpoints by their ORIGINAL key (no cluster collapsing) —
   *  preserves coords for the snap step. */
  nodes: Map<string, GraphNode>;
  /** Original endpoint key → cluster root key. Edges' from/toKey
   *  point at cluster roots; this map translates back when needed. */
  clusterRoot: Map<string, string>;
  /** Adjacency list keyed by CLUSTER ROOT. Intra-cluster edges are
   *  dropped during build so Dijkstra can't waste hops shuffling
   *  between collapsed neighbourhoods. */
  edgesByFrom: Map<string, GraphEdge[]>;
  /** All endpoints with coords. Snap dedupes by cluster root and
   *  keeps the closest physical member as the display reference. */
  geoNodes: Array<{
    key: string;
    clusterRoot: string;
    lat: number;
    lng: number;
    name: string;
  }>;
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
  /** Persistent cache of the driving polyline. Populated by the
   *  pathfinder's lazy-fetch on the first build that sees a route
   *  missing this column; never re-fetched after that until the
   *  admin edits the route (which also invalidates the memory cache
   *  via invalidateRouteGraphCache). */
  path_polyline: Array<{ lat: number; lng: number }> | null;
};

let cachedGraph: { graph: CorridorGraph; builtAt: number } | null = null;
const GRAPH_TTL_MS = 5 * 60 * 1000;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Load all active corridors and build the bidirectional graph. */
async function buildGraph(supabase: SupabaseClient): Promise<CorridorGraph> {
  const { data, error } = await supabase
    .from("routes")
    .select(
      "id, origin_name, destination_name, origin_lat, origin_lng, destination_lat, destination_lng, distance_km, ta_fare_jmd, active, path_polyline",
    )
    .eq("active", true);

  if (error) {
    throw new Error(`pathfinder: failed to load routes — ${error.message}`);
  }
  const rows = (data ?? []) as RouteRow[];

  // Lazy-fetch driving polylines for any active route missing one.
  // Without these, the snap step projects onto the straight line
  // between endpoints — which on Jamaica's curved coastal roads can
  // place a rider standing on the actual road many km off the
  // "corridor". One Google Directions call per missing route; the
  // result is persisted to routes.path_polyline so subsequent graph
  // builds (and server restarts) hit the DB cache rather than the
  // Directions API.
  //
  // Parallel — Promise.allSettled so a single failed fetch can't
  // break the whole build (the affected route falls back to the
  // straight-line projection). Capped at modest parallelism via
  // Promise.allSettled's natural behaviour; the corridor catalogue
  // is small enough that an unbounded fan-out is fine.
  const fetchTasks: Promise<void>[] = [];
  for (const r of rows) {
    if (
      r.path_polyline === null &&
      r.origin_lat != null &&
      r.origin_lng != null &&
      r.destination_lat != null &&
      r.destination_lng != null
    ) {
      const oLat = r.origin_lat;
      const oLng = r.origin_lng;
      const dLat = r.destination_lat;
      const dLng = r.destination_lng;
      const row = r;
      fetchTasks.push(
        (async () => {
          try {
            const polyline = await fetchCorridorPolyline(
              { lat: oLat, lng: oLng },
              { lat: dLat, lng: dLng },
            );
            if (!polyline) return;
            row.path_polyline = polyline;
            // Best-effort write-back. A failure here is harmless —
            // the polyline is in memory for this build and the next
            // build will simply re-fetch.
            await supabase
              .from("routes")
              .update({ path_polyline: polyline })
              .eq("id", row.id);
          } catch {
            // Swallow — straight-line fallback is correctness-safe.
          }
        })(),
      );
    }
  }
  if (fetchTasks.length > 0) {
    await Promise.allSettled(fetchTasks);
  }

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

  // Pass 1: upsert every endpoint as a node so we have the full set
  // of (key, name, coords) before clustering. We can't build edges yet
  // because we don't know cluster roots until pass 3.
  type PendingEdge = {
    routeId: string;
    fromOriginalKey: string;
    toOriginalKey: string;
    fromName: string;
    toName: string;
    fromLat: number | null;
    fromLng: number | null;
    distanceKm: number;
    fareJmd: number;
    destLat: number | null;
    destLng: number | null;
    pathPolyline: Array<{ lat: number; lng: number }> | null;
  };
  const pendingForward: PendingEdge[] = [];
  for (const r of rows) {
    const distance = typeof r.distance_km === "string"
      ? parseFloat(r.distance_km)
      : r.distance_km;
    if (!Number.isFinite(distance) || distance <= 0) continue;

    // Per-leg fare uses the TA-published number when available, else
    // the formula. Same logic as src/app/api/rider/route-taxi/hail.
    const formula = calculateRouteFare(distance);
    const fareJmd = r.ta_fare_jmd > 0 ? r.ta_fare_jmd : formula;

    const fromOriginalKey = upsertNode(
      r.origin_name,
      r.origin_lat,
      r.origin_lng,
    );
    const toOriginalKey = upsertNode(
      r.destination_name,
      r.destination_lat,
      r.destination_lng,
    );
    if (fromOriginalKey === toOriginalKey) continue;

    pendingForward.push({
      routeId: r.id,
      fromOriginalKey,
      toOriginalKey,
      fromName: r.origin_name,
      toName: r.destination_name,
      fromLat: r.origin_lat,
      fromLng: r.origin_lng,
      distanceKm: distance,
      fareJmd,
      destLat: r.destination_lat,
      destLng: r.destination_lng,
      pathPolyline: r.path_polyline,
    });
  }

  // Pass 2: union-find clustering. Collapses pairs of endpoints within
  // CLUSTER_KM into the same logical node so neighbourhoods like
  // "Negril" + "West End" share their corridor sets.
  const parent = new Map<string, string>();
  for (const k of nodes.keys()) parent.set(k, k);

  const find = (key: string): string => {
    let cur = key;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur) as string;
      // Path compression — flatten the chain on the way up.
      parent.set(cur, parent.get(next) ?? next);
      cur = parent.get(cur) as string;
    }
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Lexicographically smallest as root — deterministic across builds.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

  const nodesWithCoords = Array.from(nodes.values()).filter(
    (n) => n.lat != null && n.lng != null,
  );
  // O(N²) pair sweep — Jamaica's corridor catalogue is a few hundred
  // endpoints so this is well under a millisecond. If the catalogue
  // ever crosses ~10K endpoints we'd swap to a grid / kd-tree.
  for (let i = 0; i < nodesWithCoords.length; i++) {
    const a = nodesWithCoords[i];
    const aLat = a.lat as number;
    const aLng = a.lng as number;
    for (let j = i + 1; j < nodesWithCoords.length; j++) {
      const b = nodesWithCoords[j];
      const d = haversineKm(
        { lat: aLat, lng: aLng },
        { lat: b.lat as number, lng: b.lng as number },
      );
      if (d <= CLUSTER_KM) union(a.key, b.key);
    }
  }

  // Materialise the cluster root map with path compression done.
  const clusterRoot = new Map<string, string>();
  for (const k of nodes.keys()) clusterRoot.set(k, find(k));

  // Pass 3: build edges keyed by cluster root. Each pending forward
  // emits two GraphEdges (forward + reverse) so route taxis are
  // bidirectional. Intra-cluster edges drop — Dijkstra needs no hops
  // inside what is now one logical node.
  for (const pe of pendingForward) {
    const fromKey = clusterRoot.get(pe.fromOriginalKey) ?? pe.fromOriginalKey;
    const toKey = clusterRoot.get(pe.toOriginalKey) ?? pe.toOriginalKey;
    if (fromKey === toKey) continue;

    const forward: GraphEdge = {
      routeId: pe.routeId,
      fromKey,
      toKey,
      fromName: pe.fromName,
      toName: pe.toName,
      fromLat: pe.fromLat,
      fromLng: pe.fromLng,
      direction: "forward",
      distanceKm: pe.distanceKm,
      fareJmd: pe.fareJmd,
      destLat: pe.destLat,
      destLng: pe.destLng,
      pathPolyline: pe.pathPolyline,
    };
    const reverse: GraphEdge = {
      routeId: pe.routeId,
      fromKey: toKey,
      toKey: fromKey,
      fromName: pe.toName,
      toName: pe.fromName,
      fromLat: pe.destLat,
      fromLng: pe.destLng,
      direction: "reverse",
      distanceKm: pe.distanceKm,
      fareJmd: pe.fareJmd,
      destLat: pe.fromLat,
      destLng: pe.fromLng,
      // Reverse edge: same physical road traced backwards. The
      // polyline's vertex order doesn't matter for projection
      // (closestPointOnPolyline walks segments either way), so we
      // share the forward polyline directly rather than reversing.
      pathPolyline: pe.pathPolyline,
    };
    pushEdge(edgesByFrom, forward);
    pushEdge(edgesByFrom, reverse);
  }

  const geoNodes: CorridorGraph["geoNodes"] = [];
  for (const n of nodes.values()) {
    if (n.lat != null && n.lng != null) {
      geoNodes.push({
        key: n.key,
        clusterRoot: clusterRoot.get(n.key) ?? n.key,
        lat: n.lat,
        lng: n.lng,
        name: n.name,
      });
    }
  }

  return { nodes, clusterRoot, edgesByFrom, geoNodes };
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

/**
 * A snapped attachment to a corridor's ROAD LINE.
 *
 * Replaces the older endpoint-snap model: instead of treating each
 * corridor as just two named dots, we treat it as the segment between
 * those dots and project the rider's point perpendicular onto it.
 * A rider standing on the road sees walkKm ≈ 0 and "hail right here";
 * a rider off the road sees how far to walk to reach it.
 */
type CorridorAttachmentInternal = {
  routeId: string;
  /** Always the route's canonical forward edge — used for cluster
   *  lookups and to derive reverse-direction info on demand. */
  forwardEdge: GraphEdge;
  /** Human-readable label of the corridor: "Origin → Destination". */
  corridorLabel: string;
  /** Coords where the rider stands to board / alight (the projection
   *  point onto the corridor segment). */
  coords: { lat: number; lng: number };
  /** Perpendicular distance from the rider's typed point to `coords`. */
  walkKm: number;
  /** Position along the canonical forward direction (0 = at origin,
   *  1 = at destination). */
  t: number;
};

function positionHintFromT(t: number, fromName: string, toName: string): string {
  if (t <= 0.15) return `at ${fromName}`;
  if (t >= 0.85) return `at ${toName}`;
  if (t >= 0.4 && t <= 0.6) return `midway between ${fromName} and ${toName}`;
  if (t < 0.5) return `near ${fromName}`;
  return `near ${toName}`;
}

/** Project a point onto every TA corridor segment in the graph and
 *  return the top-N nearest within `maxKm`. Deduped by routeId so a
 *  corridor's forward and reverse edges don't appear twice.
 *
 *  When the corridor has a stored road polyline (Google Directions
 *  geometry), the projection follows the actual road. Otherwise
 *  falls back to projecting onto the straight line between the
 *  corridor's named endpoints — the legacy behaviour, kept as a
 *  safety net for routes that haven't had their polyline fetched
 *  yet (or where the fetch failed). The fallback is correctness-safe
 *  but distance-pessimistic on curved coastal / mountain roads. */
function nearestCorridorAttachments(
  graph: CorridorGraph,
  point: { lat: number; lng: number },
  maxKm: number,
  limit: number,
): CorridorAttachmentInternal[] {
  const seen = new Set<string>();
  const attachments: CorridorAttachmentInternal[] = [];
  for (const edges of graph.edgesByFrom.values()) {
    for (const edge of edges) {
      if (edge.direction !== "forward") continue;
      if (seen.has(edge.routeId)) continue;
      seen.add(edge.routeId);
      if (
        edge.fromLat == null ||
        edge.fromLng == null ||
        edge.destLat == null ||
        edge.destLng == null
      ) {
        continue;
      }
      const polyProj =
        edge.pathPolyline && edge.pathPolyline.length >= 2
          ? closestPointOnPolyline(point, edge.pathPolyline)
          : null;
      const proj =
        polyProj ??
        closestPointOnSegment(
          point,
          { lat: edge.fromLat, lng: edge.fromLng },
          { lat: edge.destLat, lng: edge.destLng },
        );
      if (proj.distKm > maxKm) continue;
      attachments.push({
        routeId: edge.routeId,
        forwardEdge: edge,
        corridorLabel: `${edge.fromName} → ${edge.toName}`,
        coords: proj.point,
        walkKm: proj.distKm,
        t: proj.t,
      });
    }
  }
  attachments.sort((a, b) => a.walkKm - b.walkKm);
  return attachments.slice(0, limit);
}

/** Synthesise a reverse-direction edge from a forward edge. The
 *  graph already stores both directions, but the snap returns only
 *  the forward representative so we materialise the reverse on
 *  demand when the rider would ride a corridor against its
 *  canonical direction. */
function reverseOf(fwd: GraphEdge): GraphEdge {
  return {
    routeId: fwd.routeId,
    fromKey: fwd.toKey,
    toKey: fwd.fromKey,
    fromName: fwd.toName,
    toName: fwd.fromName,
    fromLat: fwd.destLat,
    fromLng: fwd.destLng,
    direction: "reverse",
    distanceKm: fwd.distanceKm,
    fareJmd: fwd.fareJmd,
    destLat: fwd.fromLat,
    destLng: fwd.fromLng,
    // Same road in the opposite direction — polyline geometry is
    // identical; projection doesn't care about vertex order.
    pathPolyline: fwd.pathPolyline,
  };
}

function buildLegFromEdge(
  edge: GraphEdge,
  concession: boolean,
): CorridorLeg {
  const legFare = concession
    ? calculateConcessionFare(edge.distanceKm)
    : edge.fareJmd;
  return {
    routeId: edge.routeId,
    origin: edge.fromName,
    destination: edge.toName,
    direction: edge.direction,
    distanceKm: edge.distanceKm,
    fareJmd: legFare,
    originLat: edge.fromLat,
    originLng: edge.fromLng,
    destinationLat: edge.destLat,
    destinationLng: edge.destLng,
  };
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
  const concession = args.concession === true;

  // Snap pickup + dropoff onto corridor ROAD LINES (not just
  // endpoints). A rider whose pickup falls perpendicular onto an
  // active corridor — anywhere along it — can hail there directly.
  const pickupAttachments = nearestCorridorAttachments(
    graph,
    args.pickup,
    snapKm,
    8,
  );
  const dropoffAttachments = nearestCorridorAttachments(
    graph,
    args.dropoff,
    snapKm,
    8,
  );
  if (pickupAttachments.length === 0 || dropoffAttachments.length === 0) {
    return null;
  }

  // Score is total fare + walking penalty. Walking is real effort so
  // even free same-corridor walks are weighted ~50 JMD/km.
  const WALK_PENALTY_PER_KM = 50;
  const fareOf = (km: number, baseFareJmd: number): number =>
    concession ? calculateConcessionFare(km) : baseFareJmd;

  type Candidate = {
    legs: CorridorLeg[];
    totalFareJmd: number;
    totalDistanceKm: number;
    boardingAttachment: CorridorAttachmentInternal;
    alightingAttachment: CorridorAttachmentInternal;
    boardingTAlongLeg: number;
    alightingTAlongLeg: number;
  };

  /** Score = fare + walk-penalty. Lower is better. */
  const scoreOf = (c: Candidate) =>
    c.totalFareJmd +
    (c.boardingAttachment.walkKm + c.alightingAttachment.walkKm) *
      WALK_PENALTY_PER_KM;

  // Compare-and-return (pure) instead of closure mutation so the
  // compiler can track `best`'s type through every assignment.
  const pickBetter = (
    a: Candidate | null,
    b: Candidate,
  ): Candidate => (a == null || scoreOf(b) < scoreOf(a) ? b : a);

  let best: Candidate | null = null;

  // ─── Case A: same corridor (rider boards + alights on same road) ───
  // The cleanest result for a rider standing on a road they can just
  // ride to their destination. Single leg, full TA corridor fare, no
  // transfer. Direction is determined by the `t` ordering.
  for (const p of pickupAttachments) {
    for (const d of dropoffAttachments) {
      if (p.routeId !== d.routeId) continue;
      // Reject degenerate "ride zero distance" trips — the rider's
      // pickup and dropoff project to essentially the same point.
      if (Math.abs(d.t - p.t) < 0.01) continue;

      const fwd = p.t < d.t;
      const edge = fwd ? p.forwardEdge : reverseOf(p.forwardEdge);
      const legFare = fareOf(edge.distanceKm, edge.fareJmd);

      const leg: CorridorLeg = {
        routeId: edge.routeId,
        origin: edge.fromName,
        destination: edge.toName,
        direction: edge.direction,
        distanceKm: edge.distanceKm,
        fareJmd: legFare,
        originLat: edge.fromLat,
        originLng: edge.fromLng,
        destinationLat: edge.destLat,
        destinationLng: edge.destLng,
      };
      best = pickBetter(best, {
        legs: [leg],
        totalFareJmd: legFare,
        totalDistanceKm: edge.distanceKm,
        boardingAttachment: p,
        alightingAttachment: d,
        // The rider's actual board/alight position along this single
        // leg (in the leg's own forward direction).
        boardingTAlongLeg: fwd ? p.t : 1 - p.t,
        alightingTAlongLeg: fwd ? d.t : 1 - d.t,
      });
    }
  }

  // ─── Case B: different corridors — transfer via cluster endpoints ───
  // The rider boards the pickup corridor, rides to one of its endpoints,
  // transfers (zero or more middle corridors), rides the dropoff
  // corridor to the alight point. Direction combos are 2 × 2 = 4 per
  // (pickup, dropoff) pair.
  for (const p of pickupAttachments) {
    for (const d of dropoffAttachments) {
      if (p.routeId === d.routeId) continue; // handled in case A

      const pForward = p.forwardEdge;
      const dForward = d.forwardEdge;
      const pLegFare = fareOf(pForward.distanceKm, pForward.fareJmd);
      const dLegFare = fareOf(dForward.distanceKm, dForward.fareJmd);

      // Pickup direction options: forward (ride to pForward.toKey) or
      // reverse (ride to pForward.fromKey).
      const pickupOptions = [
        {
          edge: pForward,
          arrivesAt: pForward.toKey,
          boardingTAlongLeg: p.t,
        },
        {
          edge: reverseOf(pForward),
          arrivesAt: pForward.fromKey,
          boardingTAlongLeg: 1 - p.t,
        },
      ] as const;
      // Dropoff direction options: forward (start at dForward.fromKey,
      // ride to dForward.toKey, alight at d.t) or reverse (start at
      // dForward.toKey, alight at 1 - d.t).
      const dropoffOptions = [
        {
          edge: dForward,
          startsFrom: dForward.fromKey,
          alightingTAlongLeg: d.t,
        },
        {
          edge: reverseOf(dForward),
          startsFrom: dForward.toKey,
          alightingTAlongLeg: 1 - d.t,
        },
      ] as const;

      for (const po of pickupOptions) {
        for (const dO of dropoffOptions) {
          // We've already spent 2 legs on the pickup + dropoff
          // corridors; the middle Dijkstra has at most maxLegs - 2.
          const middleBudget = Math.max(0, maxLegs - 2);

          let middleEdges: GraphEdge[] = [];
          let middleFare = 0;
          if (po.arrivesAt !== dO.startsFrom) {
            if (middleBudget <= 0) continue;
            const middle = dijkstra(
              graph,
              po.arrivesAt,
              dO.startsFrom,
              middleBudget,
            );
            if (!middle || middle.length === 0) continue;
            middleEdges = middle;
            middleFare = middle.reduce(
              (s, e) => s + fareOf(e.distanceKm, e.fareJmd),
              0,
            );
          }

          const legs: CorridorLeg[] = [
            buildLegFromEdge(po.edge, concession),
            ...middleEdges.map((e) => buildLegFromEdge(e, concession)),
            buildLegFromEdge(dO.edge, concession),
          ];
          const totalFareJmd =
            pLegFare + middleFare + dLegFare;
          const totalDistanceKm =
            pForward.distanceKm +
            middleEdges.reduce((s, e) => s + e.distanceKm, 0) +
            dForward.distanceKm;

          best = pickBetter(best, {
            legs,
            totalFareJmd,
            totalDistanceKm,
            boardingAttachment: p,
            alightingAttachment: d,
            boardingTAlongLeg: po.boardingTAlongLeg,
            alightingTAlongLeg: dO.alightingTAlongLeg,
          });
        }
      }
    }
  }

  if (!best) return null;

  // Build the boarding / alighting payloads from the chosen
  // attachments. Position hints respect the leg's direction so the
  // rider's UI copy is honest — "near West End" reflects where they
  // actually stand, not the corridor's canonical orientation.
  const boardingHint = positionHintFromT(
    best.boardingTAlongLeg,
    best.legs[0].origin,
    best.legs[0].destination,
  );
  const alightingHint = positionHintFromT(
    best.alightingTAlongLeg,
    best.legs[best.legs.length - 1].origin,
    best.legs[best.legs.length - 1].destination,
  );

  const hailable =
    best.boardingAttachment.walkKm <= MAX_HAILABLE_WALK_KM &&
    best.alightingAttachment.walkKm <= MAX_HAILABLE_WALK_KM;

  return {
    legs: best.legs,
    totalFareJmd: best.totalFareJmd,
    totalDistanceKm: best.totalDistanceKm,
    legCount: best.legs.length,
    boarding: {
      coords: best.boardingAttachment.coords,
      corridorLabel: best.boardingAttachment.corridorLabel,
      walkKm: best.boardingAttachment.walkKm,
      positionHint: boardingHint,
    },
    alighting: {
      coords: best.alightingAttachment.coords,
      corridorLabel: best.alightingAttachment.corridorLabel,
      walkKm: best.alightingAttachment.walkKm,
      positionHint: alightingHint,
    },
    hailable,
  };
}
