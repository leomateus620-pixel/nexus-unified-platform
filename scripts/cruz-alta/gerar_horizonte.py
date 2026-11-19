"""Reproject licensed regional rasters into the metric frame in registro.ts.

Usage: python gerar_horizonte.py SOURCE_CACHE OUTPUT_DIRECTORY
Requires rasterio, numpy, Pillow, requests. Downloaded originals stay in SOURCE_CACHE.
"""

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from imagem_cbers import imagery, CREDIT

LAT, LON = -28.66355384, -53.60602301
R = 6378137
SCALE = math.cos(math.radians(LAT))
SOURCES = {
    "dem.tif": "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/Copernicus_DSM_COG_10_S29_00_W054_00_DEM/Copernicus_DSM_COG_10_S29_00_W054_00_DEM.tif",
    "rgb.tif": "https://esa-worldcover-s2.s3.eu-central-1.amazonaws.com/rgbnir/2021/S29/ESA_WorldCover_10m_2021_v200_S29W054_S2RGBNIR.tif",
    "worldcover.tif": "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S30W054_Map.tif",
    "municipio.json": "https://servicodados.ibge.gov.br/api/v3/malhas/municipios/4306106?formato=application/vnd.geo%2Bjson&qualidade=maxima",
}
CREDITS = [
    "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.",
    "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium. CC BY 4.0.",
    "IBGE · Malhas Territoriais · Cruz Alta/RS (4306106).",
]


def mercator_y(lat):
    return R * math.asinh(math.tan(math.radians(lat)))


def local(lon, lat):
    return (
        R * math.radians(lon - LON) * SCALE,
        (mercator_y(LAT) - mercator_y(lat)) * SCALE,
    )


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def fetch(path, url):
    if path.exists():
        return
    partial = path.with_suffix(".partial")
    with requests.get(url, stream=True, timeout=120) as response, partial.open(
        "wb"
    ) as dest:
        response.raise_for_status()
        for chunk in response.iter_content(1024 * 1024):
            dest.write(chunk)
    partial.replace(path)


def raster(dataset, band, bounds, cols, rows, method):
    west, north, east, south = bounds

    def east_m(x):
        return R * math.radians(LON) + x / SCALE

    def north_m(z):
        return mercator_y(LAT) - z / SCALE

    affine = from_bounds(
        east_m(west), north_m(south), east_m(east), north_m(north), cols, rows
    )
    result = np.empty((rows, cols), dtype="float32")
    reproject(
        rasterio.band(dataset, band),
        result,
        dst_transform=affine,
        dst_crs="EPSG:3857",
        dst_nodata=np.nan,
        resampling=method,
        num_threads=2,
    )
    if not np.isfinite(result).all():
        raise ValueError(f"Fonte incompleta na extensão solicitada: {dataset.name}")
    return result


def grid(out, prefix, bounds, step, resolution, site_height, dem, color, cover):
    west, north, east, south = bounds
    cols, rows = round((east - west) / step) + 1, round((south - north) / step) + 1
    dx, dz = (east - west) / (cols - 1), (south - north) / (rows - 1)
    nodes = [west - dx / 2, north - dz / 2, east + dx / 2, south + dz / 2]
    h = raster(dem, 1, nodes, cols, rows, Resampling.bilinear)
    height_file = prefix + "elevacoes.bin"
    np.rint(h * 10).astype("<u2").tofile(out / height_file)
    width, height = round((east - west) / resolution), round(
        (south - north) / resolution
    )
    bands = [
        raster(color, band, bounds, width, height, Resampling.average)
        for band in (1, 2, 3)
    ]
    # Same display transform on both images. The COG explicitly labels bands 1..3 as R/G/B.
    linear = np.maximum(np.stack(bands, axis=-1) * 0.0001 - 0.006, 0) * 2.3
    srgb = np.where(
        linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055
    )
    image_name = prefix + "cobertura.webp"
    Image.fromarray(np.rint(np.clip(srgb, 0, 1) * 255).astype("uint8")).save(
        out / image_name, quality=86, method=6
    )
    classes = raster(cover, 1, bounds, width, height, Resampling.nearest)
    codes, counts = np.unique(classes.astype("uint8"), return_counts=True)
    return dict(
        bounds=bounds,
        cols=cols,
        rows=rows,
        heights=height_file,
        albedo=image_name,
        verticalScaleMeters=0.1,
        altitudeOffsetMeters=0,
        siteElevationMeters=site_height,
        elevationRangeMeters=[round(float(h.min()), 1), round(float(h.max()), 1)],
        spacingMeters=[round(dx, 3), round(dz, 3)],
        imagePixels=[width, height],
        imageSpacingMeters=resolution,
        landCoverPercent={
            str(c): round(n * 100 / classes.size, 2) for c, n in zip(codes, counts)
        },
    )


def main(cache, out):
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    for filename, url in SOURCES.items():
        fetch(cache / filename, url)
    feature = json.loads((cache / "municipio.json").read_text())["features"][0]
    assert feature["properties"]["codarea"] == "4306106"
    polys = feature["geometry"]["coordinates"]
    rings = (
        [polys[0]]
        if feature["geometry"]["type"] == "Polygon"
        else [p[0] for p in polys]
    )
    pts = [local(*pt) for ring in rings for pt in ring]
    xs, zs = zip(*pts)
    bounds = [
        math.floor(min(xs) / 1000) * 1000 - 2000,
        math.floor(min(zs) / 1000) * 1000 - 2000,
        math.ceil(max(xs) / 1000) * 1000 + 2000,
        math.ceil(max(zs) / 1000) * 1000 + 2000,
    ]
    with rasterio.open(cache / "dem.tif") as dem, rasterio.open(
        cache / "rgb.tif"
    ) as color, rasterio.open(cache / "worldcover.tif") as cover:
        assert color.tags()["bands"].startswith("Band 1: B04 (Red)")
        site_height = round(
            float(
                raster(dem, 1, [-0.5, -0.5, 0.5, 0.5], 1, 1, Resampling.bilinear)[0, 0]
            ),
            2,
        )
        wide = grid(out, "", bounds, 160, 30, site_height, dem, color, cover)
        detail = grid(
            out,
            "local-",
            [-7200, -7200, 7200, 7200],
            37.5,
            10,
            site_height,
            dem,
            color,
            cover,
        )

    def merc_bounds(bounds):
        w, n, e, s = bounds
        base_x, base_y = R * math.radians(LON), mercator_y(LAT)
        return [
            base_x + w / SCALE,
            base_y - s / SCALE,
            base_x + e / SCALE,
            base_y - n / SCALE,
        ]

    actual, nearby, cbers = imagery(cache, out, merc_bounds, detail, digest)
    detail.update(actual)
    manifest = {
        **wide,
        "detail": detail,
        "nearby": nearby,
        "origin": [LON, LAT],
        "verticalDatum": "EGM2008",
        "attribution": [*CREDITS, CREDIT],
        "sources": [
            cbers,
            *[
                dict(id=key, url=url, sha256=digest(cache / key))
                for key, url in SOURCES.items()
            ],
        ],
        "derivatives": {
            p.name: digest(p)
            for p in sorted(out.iterdir())
            if p.suffix in (".bin", ".webp")
        },
    }
    save_json(out / "manifest.json", manifest)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
