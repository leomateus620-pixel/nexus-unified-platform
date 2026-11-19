"""Recorte ortorretificado do INPE, em cores naturais, para a vizinhança de Cruz Alta."""

import json
from pathlib import Path

import numpy as np
import rasterio
import requests
from PIL import Image
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
from rasterio.windows import Window, from_bounds as source_window

STAC = (
    "https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1/items/"
    "CBERS4A_WPM_PCA_RGB321_20260809_209_149"
)
CREDIT = "INPE/Brazil Data Cube · CBERS-4A/WPM · 09/08/2026 · fusão PCA e recorte em cores naturais. CC BY 4.0."


def imagery(cache, out, merc_bounds, wide_detail, digest):
    entry = requests.get(STAC, timeout=30)
    entry.raise_for_status()
    asset = entry.json()["assets"]["tci"]
    path = cache / "cbers-209-149-agosto.tif"
    if not path.is_file():
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            GDAL_HTTP_MULTIRANGE="SERIAL",
            GDAL_HTTP_TIMEOUT="60",
        ), rasterio.open("/vsicurl/" + asset["href"]) as ds:
            limits = transform_bounds(
                "EPSG:3857", ds.crs, *merc_bounds(wide_detail["bounds"])
            )
            x, y, w, h = source_window(*limits, ds.transform).flatten()
            win = Window(int(x) - 4, int(y) - 4, int(w) + 10, int(h) + 10)
            profile = dict(
                driver="GTiff",
                crs=ds.crs,
                transform=ds.window_transform(win),
                count=3,
                width=int(win.width),
                height=int(win.height),
                dtype="uint8",
                tiled=True,
                compress="deflate",
                nodata=0,
            )
            partial = path.with_suffix(".partial")
            with rasterio.open(partial, "w", **profile) as target:
                # Read all channels together. The source is a pixel-interleaved, remote COG.
                for row in range(0, int(win.height), 512):
                    stripe = Window(0, row, win.width, min(512, win.height - row))
                    target.write(
                        ds.read(
                            (1, 2, 3),
                            window=Window(
                                win.col_off,
                                win.row_off + row,
                                stripe.width,
                                stripe.height,
                            ),
                        ),
                        window=stripe,
                    )
            partial.replace(path)

    def read(ds, bounds, side):
        aff = from_bounds(*merc_bounds(bounds), side, side)
        with WarpedVRT(
            ds,
            crs="EPSG:3857",
            transform=aff,
            width=side,
            height=side,
            resampling=Resampling.bilinear,
        ) as vrt:
            return np.moveaxis(vrt.read(), 0, -1)

    dst = out / wide_detail["albedo"]
    with rasterio.open(path) as cbers:
        # Calibrate the unscaled digital numbers against the broad true-colour mosaic.
        # A single transfer per channel is used at both distances and preserves physical edges.
        ref = np.asarray(Image.open(dst).resize((720, 720), Image.Resampling.BOX))
        sample = read(cbers, wide_detail["bounds"], 720)
        valid = np.all(sample > 0, axis=-1)
        q = [1, 10, 35, 65, 90, 99, 99.8]
        tables = []
        for ch in range(3):
            src = np.percentile(sample[:, :, ch][valid], q)
            target = np.percentile(ref[:, :, ch][valid], q)
            tables.append(
                np.interp(np.arange(256), [0, *src, 255], [0, *target, 255])
                .round()
                .astype("uint8")
            )

        def write(bounds, filename, pixels):
            raw = read(cbers, bounds, pixels)
            mask = np.any(raw == 0, axis=-1)
            output = np.stack([tables[i][raw[:, :, i]] for i in range(3)], axis=-1)
            if mask.any():
                if bounds != wide_detail["bounds"]:
                    raise ValueError("Sem cobertura CBERS na vizinhança imediata.")
                prior = np.asarray(
                    Image.open(dst).resize((pixels, pixels), Image.Resampling.BILINEAR)
                )
                output[mask] = prior[mask]
            Image.fromarray(output).save(out / filename, quality=90, method=6)
            return dict(
                bounds=bounds,
                albedo=filename,
                imagePixels=[pixels, pixels],
                imageSpacingMeters=(bounds[2] - bounds[0]) / pixels,
                percentCoverageCBERS=round(100 * (1 - mask.mean()), 4),
            )

        # Prepare the closer image first, keeping the underlying Sentinel texture for fallback.
        nearby = write([-1600, -1600, 1600, 1600], "vizinhos.webp", 1600)
        detail = write(wide_detail["bounds"], wide_detail["albedo"], 4096)
    source = dict(
        id=entry.json()["id"],
        url=STAC,
        asset=asset["href"],
        sourceSHA256=asset["checksum:multihash"][4:],
        clippedSHA256=digest(path),
        license="https://creativecommons.org/licenses/by/4.0/",
        cutlineCRS="EPSG:32722",
    )
    return detail, nearby, source
