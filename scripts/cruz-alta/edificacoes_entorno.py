"""Gera a massa urbana externa de Cruz Alta a partir de uma exportação da API OpenStreetMap.

Uso: python3 scripts/cruz-alta/edificacoes_entorno.py entorno.osm edificacoes.json
O arquivo OSM pode ser obtido na URL de origem registrada abaixo. O subconjunto
resultante é disponibilizado sob ODbL. Endereços e nomes pessoais são descartados.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

SOURCE = "https://api.openstreetmap.org/api/0.6/map?bbox=-53.6221,-28.6785,-53.5883,-28.6484"
LAT, LON, R = -28.66355384, -53.60602301, 6378137
SCALE = math.cos(math.radians(LAT))


def local(lon, lat):
    def mercator(phi):
        return R * math.log(math.tan(math.pi/4 + math.radians(phi)/2))
    return (R * math.radians(lon - LON) * SCALE, (mercator(LAT) - mercator(lat)) * SCALE)


def export(source):
    root = ET.parse(source).getroot()
    node = {n.get("id"): local(float(n.get("lon")), float(n.get("lat"))) for n in root.findall("node")}
    items = []
    for way in root.findall("way"):
        tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
        if tags.get("building") in (None, "no"): continue
        coordinates = [node[n.get("ref")] for n in way.findall("nd")]
        if len(coordinates) < 4 or coordinates[0] != coordinates[-1]: continue
        ring = coordinates[:-1]
        x, z = (sum(p[i] for p in ring)/len(ring) for i in (0, 1))
        distance = math.hypot(x,z)
        if not (310 < distance < 1000 and (z < -200 or x > 450 and z < 300)): continue
        encoded = []
        for px,pz in ring:
            pt = [round(px*4), round(pz*4)]
            if pt != encoded[-2:]: encoded.extend(pt)
        if len(encoded) < 6: continue
        levels = tags.get("building:levels","")
        floors = int(levels) if levels.isdigit() and 0 < int(levels) <= 20 else 0
        items.append([floors, encoded])
    return {"source":SOURCE, "sourceSha256":hashlib.sha256(source.read_bytes()).hexdigest(),
            "copyright":"© OpenStreetMap contributors", "license":"ODbL 1.0",
            "licenseUrl":"https://opendatacommons.org/licenses/odbl/1-0/",
            "attributionUrl":"https://www.openstreetmap.org/copyright",
            "unitsPerMetre":4,"objects":items}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    result=export(args.source)
    args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n")
    print(len(result["objects"]), "polígonos externos")
