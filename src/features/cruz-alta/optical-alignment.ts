/** Source sampling displacement found at four ground controls. +X east, +Z south.
 * Raster V increases northward. The DEM and cadastral/technical geometry keep their original frame.
 * Full adjustment within the verified factory area; the surrounding city keeps native geolocation. */
export const opticalAlignment = {
  east: -12,
  south: 1.5,
  fullRadius: 310,
  outerRadius: 620,
} as const;
