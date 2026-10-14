export type MapPreference = "automatic" | "night" | "day";
export function mapPreference(value: unknown): MapPreference {
  return value === "night" || value === "day" ? value : "automatic";
}
export function resolveMapTheme(
  preference: MapPreference,
  appearance: "dark" | "light",
): "night" | "day" {
  return preference === "automatic"
    ? appearance === "dark"
      ? "night"
      : "day"
    : preference;
}
export function studioStyle(value: string | undefined): string | null {
  return value &&
    /^mapbox:\/\/styles\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(value.trim())
    ? value.trim()
    : null;
}

/** One non-composited Mapbox Streets source; names/geometry are provider data. */
export function buildMapTheme(theme: "night" | "day") {
  const night = theme === "night";
  const c = night
    ? {
        ground: "#141617",
        land: "#1c1e1c",
        park: "#202a24",
        water: "#142731",
        building: "#292c2b",
        casing: "#121516",
        highway: "#6f706a",
        arterial: "#494d4d",
        local: "#333a3b",
        label: "#c8c5bb",
        muted: "#7f8988",
      }
    : {
        ground: "#ebe9e2",
        land: "#e0e1d7",
        park: "#ccd9c5",
        water: "#b3ced9",
        building: "#d5d3ca",
        casing: "#c6c5bd",
        highway: "#faf4e8",
        arterial: "#ffffff",
        local: "#f8f7f3",
        label: "#363c3c",
        muted: "#727a73",
      };
  const width = (factor: number) => [
    "interpolate",
    ["linear"],
    ["zoom"],
    7,
    0.35 * factor,
    12,
    1.5 * factor,
    16,
    5 * factor,
    19,
    17 * factor,
  ];
  const layers: Record<string, unknown>[] = [
    {
      id: "ground",
      type: "background",
      paint: { "background-color": c.ground },
    },
    {
      id: "land",
      type: "fill",
      source: "roam-streets",
      "source-layer": "landuse",
      paint: { "fill-color": c.land, "fill-opacity": 0.6 },
    },
    {
      id: "parks",
      type: "fill",
      source: "roam-streets",
      "source-layer": "landuse",
      filter: [
        "match",
        ["get", "class"],
        ["park", "wood", "national_park", "golf_course"],
        true,
        false,
      ],
      paint: { "fill-color": c.park, "fill-opacity": 0.8 },
    },
    {
      id: "water",
      type: "fill",
      source: "roam-streets",
      "source-layer": "water",
      paint: { "fill-color": c.water },
    },
    {
      id: "waterways",
      type: "line",
      source: "roam-streets",
      "source-layer": "waterway",
      minzoom: 11,
      paint: { "line-color": c.water, "line-width": width(0.4) },
    },
    {
      id: "buildings",
      type: "fill",
      source: "roam-streets",
      "source-layer": "building",
      minzoom: 15,
      paint: {
        "fill-color": c.building,
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15,
          0.25,
          17,
          0.85,
        ],
        "fill-outline-color": c.casing,
      },
    },
  ];
  for (const [name, classes, factor, color, minzoom] of [
    ["local", ["street", "street_limited", "service"], 0.55, c.local, 11],
    ["secondary", ["secondary", "tertiary"], 0.85, c.arterial, 9],
    ["primary", ["primary", "trunk"], 1.15, c.highway, 7],
    ["motorway", ["motorway"], 1.5, c.highway, 5],
  ] as const) {
    const filter = ["match", ["get", "class"], [...classes], true, false];
    const shared = {
      source: "roam-streets",
      "source-layer": "road",
      minzoom,
      filter,
      layout: { "line-cap": "round", "line-join": "round" },
    };
    layers.push({
      id: `${name}-casing`,
      type: "line",
      ...shared,
      paint: { "line-color": c.casing, "line-width": width(factor * 1.5) },
    });
    layers.push({
      id: `${name}-road`,
      type: "line",
      ...shared,
      paint: { "line-color": color, "line-width": width(factor) },
    });
  }
  layers.push({
    id: "paths",
    type: "line",
    source: "roam-streets",
    "source-layer": "road",
    minzoom: 16,
    filter: ["match", ["get", "class"], ["path", "pedestrian"], true, false],
    paint: {
      "line-color": c.muted,
      "line-width": 1,
      "line-opacity": 0.45,
      "line-dasharray": [1, 2],
    },
  });
  const labelPaint = {
    "text-color": c.label,
    "text-halo-color": c.ground,
    "text-halo-width": 1.8,
  };
  layers.push({
    id: "road-names",
    type: "symbol",
    source: "roam-streets",
    "source-layer": "road",
    minzoom: 14,
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
      "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
      "text-size": 11,
    },
    paint: labelPaint,
  });
  layers.push({
    id: "highway-refs",
    type: "symbol",
    source: "roam-streets",
    "source-layer": "road",
    minzoom: 10,
    filter: ["match", ["get", "class"], ["motorway", "trunk"], true, false],
    layout: {
      "symbol-placement": "line",
      "text-field": ["coalesce", ["get", "ref"], ""],
      "text-font": ["DIN Pro Medium"],
      "text-size": 11,
      "symbol-spacing": 450,
    },
    paint: { ...labelPaint, "text-halo-width": 3 },
  });
  for (const [id, classes, minzoom, size] of [
    ["cities", ["city", "town"], 6, 15],
    ["districts", ["suburb", "neighbourhood", "village"], 12, 11],
  ] as const) {
    layers.push({
      id,
      type: "symbol",
      source: "roam-streets",
      "source-layer": "place_label",
      minzoom,
      filter: ["match", ["get", "type"], [...classes], true, false],
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": size,
        "text-letter-spacing": 0.08,
      },
      paint: labelPaint,
    });
  }
  return {
    version: 8,
    name: `ROAM ${night ? "Night" : "Day"}`,
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sources: {
      "roam-streets": {
        type: "vector",
        url: "mapbox://mapbox.mapbox-streets-v8",
      },
    },
    layers,
  };
}
